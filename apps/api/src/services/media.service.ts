import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { badRequest, payloadTooLarge } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Media storage.
 *
 * Files travel Admin → API → storage, exactly as the architecture specifies. Routing the
 * bytes through the API rather than handing the browser a presigned S3 URL means the
 * bucket needs no CORS rules, no upload URL is ever exposed to a client, and — crucially —
 * the server can inspect the actual bytes before anything is written.
 *
 * Two drivers share one interface: `s3` for production, `local` for development when no
 * AWS credentials are configured. The calling code cannot tell them apart, so the
 * development fallback does not change the production architecture.
 */

export interface StoredFile {
  key: string;
  url: string;
  bytes: number;
  mimeType: string;
  width: number | null;
  height: number | null;
}

/**
 * Magic-byte signatures.
 *
 * A `Content-Type` header and a file extension are both attacker-controlled. Checking the
 * leading bytes is what actually establishes that a file claiming to be a PNG is a PNG,
 * and it is the control that stops a polyglot or a renamed script being stored and later
 * served back.
 */
const SIGNATURES: Array<{ mime: string; ext: string; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
];

/** SVG is accepted for the logo/favicon only and is never trusted as-is — see below. */
const SVG_MIME = 'image/svg+xml';

export interface DetectedType {
  mime: string;
  ext: string;
}

export function detectType(buffer: Buffer, declaredMime: string, filename: string): DetectedType {
  for (const sig of SIGNATURES) {
    if (buffer.length >= 12 && sig.test(buffer)) {
      return { mime: sig.mime, ext: sig.ext };
    }
  }

  // SVG has no binary magic number, so it is identified by content and only accepted
  // when it was actually declared as SVG.
  const head = buffer.subarray(0, 1024).toString('utf8').trim().toLowerCase();
  if (declaredMime === SVG_MIME && (head.startsWith('<svg') || head.startsWith('<?xml'))) {
    return { mime: SVG_MIME, ext: 'svg' };
  }

  throw badRequest(
    `That file type is not supported. Upload a JPG, PNG, WebP, GIF, SVG or PDF. (received: ${path.extname(filename) || 'unknown'})`,
  );
}

/**
 * Strips scriptable content from SVG.
 *
 * An SVG is a document that can carry `<script>` and event handlers, so an uploaded SVG
 * served from our own origin is a stored-XSS vector. Rather than reject SVG — the logo and
 * favicon genuinely want it — the dangerous constructs are removed before storage.
 */
export function sanitizeSvg(buffer: Buffer): Buffer {
  const cleaned = buffer
    .toString('utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '');
  return Buffer.from(cleaned, 'utf8');
}

/** Reads intrinsic dimensions so the CMS can record them without an image library. */
export function readDimensions(buffer: Buffer, mime: string): { width: number | null; height: number | null } {
  try {
    if (mime === 'image/png' && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mime === 'image/gif' && buffer.length > 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1]!;
        const length = buffer.readUInt16BE(offset + 2);
        // SOF0..SOF3 and SOF5..SOF15 carry the frame dimensions.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    // Dimensions are metadata, not a gate. A file we cannot measure still stores fine.
  }
  return { width: null, height: null };
}

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: env.AWS_REGION,
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? { credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } }
        : {}),
    });
  }
  return s3;
}

export const mediaService = {
  /**
   * Validates and stores an uploaded file.
   *
   * The stored key is a server-generated UUID with an extension derived from the sniffed
   * type — never the user's filename. A crafted name cannot then traverse directories or
   * land as an executable-looking path; the original name is kept as metadata only.
   */
  async store(file: { buffer: Buffer; originalname: string; mimetype: string }): Promise<StoredFile> {
    if (file.buffer.length === 0) throw badRequest('That file is empty');
    if (file.buffer.length > env.MAX_UPLOAD_BYTES) {
      throw payloadTooLarge(`Files must be under ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
    }

    const detected = detectType(file.buffer, file.mimetype, file.originalname);
    const payload = detected.mime === SVG_MIME ? sanitizeSvg(file.buffer) : file.buffer;
    const dims = readDimensions(payload, detected.mime);

    const key = `media/${new Date().getFullYear()}/${crypto.randomUUID()}.${detected.ext}`;

    if (env.MEDIA_DRIVER === 's3') {
      await client().send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET!,
          Key: key,
          Body: payload,
          ContentType: detected.mime,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      const base = env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com`;
      return { key, url: `${base}/${key}`, bytes: payload.length, mimeType: detected.mime, ...dims };
    }

    const dir = path.resolve(env.LOCAL_UPLOAD_DIR);
    const target = path.join(dir, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, payload);
    logger.info({ key }, 'Stored media on local disk (development driver)');

    return { key, url: `/uploads/${key}`, bytes: payload.length, mimeType: detected.mime, ...dims };
  },

  async remove(key: string): Promise<void> {
    if (env.MEDIA_DRIVER === 's3') {
      await client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
      return;
    }
    const target = path.join(path.resolve(env.LOCAL_UPLOAD_DIR), key);
    // Refuse to delete anything that resolves outside the upload directory.
    if (!target.startsWith(path.resolve(env.LOCAL_UPLOAD_DIR))) {
      throw badRequest('Invalid media key');
    }
    await fs.rm(target, { force: true });
  },

  publicUrl(key: string): string {
    if (env.MEDIA_DRIVER === 's3') {
      const base = env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com`;
      return `${base}/${key}`;
    }
    return `/uploads/${key}`;
  },
};
