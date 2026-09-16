/**
 * Files attached to enquiries.
 *
 * Separate from `media.service` on purpose, because the two have opposite requirements.
 * Media is uploaded by an authenticated editor and is meant to be public — it ends up on a
 * page. This is uploaded by anyone on the internet and must never be public: it is a
 * client's specification or contract, arriving under a form that says "your project details
 * remain confidential".
 *
 * So the bytes are written outside every served directory, the stored path is generated
 * here rather than taken from the visitor, and reading one back requires an admin session.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MAX_ATTACHMENT_BYTES } from '@aptentech/shared';
import { env } from '../config/env';
import { badRequest, payloadTooLarge } from '../utils/errors';
import { logger } from '../utils/logger';

export interface StoredAttachment {
  storageKey: string;
  filename: string;
  mimeType: string;
  bytes: number;
}

/**
 * Types accepted, identified by their leading bytes.
 *
 * The browser's `Content-Type` and the file's extension are both written by whoever is
 * uploading, so neither establishes anything. What a file *is* shows in its first few
 * bytes, and that is what is checked here.
 */
interface Signature {
  mime: string;
  ext: string;
  test: (buffer: Buffer, extension: string) => boolean;
}

/** Office 2007+ formats are ZIP archives; the member names say which application wrote them. */
function zipContains(buffer: Buffer, entry: string): boolean {
  // The entry names sit in the local file headers, near the front of a Word or Excel file.
  return buffer.subarray(0, 8192).includes(Buffer.from(entry, 'latin1'));
}

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isOle = (b: Buffer): boolean => b.subarray(0, 8).equals(OLE_MAGIC);

const SIGNATURES: Signature[] = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
  { mime: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },

  /*
    A ZIP archive is only accepted when it is demonstrably a Word or Excel document.

    This is the reason plain `.zip` is not on the list at all: the signature is identical, and
    what a ZIP contains cannot be established from its header — accepting one would mean
    storing arbitrary unexamined content from an anonymous uploader.
  */
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
    test: (b) => b.subarray(0, 2).toString('ascii') === 'PK' && zipContains(b, 'word/'),
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
    test: (b) => b.subarray(0, 2).toString('ascii') === 'PK' && zipContains(b, 'xl/'),
  },

  /*
    Legacy .doc and .xls share one container format (OLE compound file) and telling them
    apart means walking the container's own directory stream. That is more machinery than
    the distinction earns, so the container is established from the bytes — which is what
    excludes a renamed executable — and which of the two it is comes from the extension.

    The consequence is bounded: the worst a mislabelled file achieves is being called .doc
    when it is .xls. It is never executed, never served inline, and never opened by us.
  */
  {
    mime: 'application/msword',
    ext: 'doc',
    test: (b, ext) => isOle(b) && ext === 'doc',
  },
  {
    mime: 'application/vnd.ms-excel',
    ext: 'xls',
    test: (b, ext) => isOle(b) && ext === 'xls',
  },
];

/**
 * The visitor's filename, made safe to display and to log.
 *
 * It is never used to build a path — the stored name is generated — so this is not a
 * traversal defence. It is about what an admin sees: control characters, newlines and
 * directory separators in a name are all ways to make a listing read as something it is
 * not, and there is no reason an enquiry needs them.
 */
function displayName(original: string): string {
  const base = path
    .basename(original)
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '')
    .trim();
  return (base || 'attachment').slice(0, 160);
}

export const attachmentService = {
  /**
   * Validates a file and writes it to private storage.
   *
   * Throws rather than returning an error, so a rejected upload cannot be mistaken for a
   * stored one by a caller that forgot to check.
   */
  async store(file: { buffer: Buffer; originalname: string }): Promise<StoredAttachment> {
    if (file.buffer.length === 0) throw badRequest('That file is empty.');
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw payloadTooLarge(`Files must be under ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
    }
    // Every signature reads within the first twelve bytes; anything shorter cannot be checked.
    if (file.buffer.length < 12) throw badRequest('That file is too small to be read.');

    const extension = path.extname(file.originalname).slice(1).toLowerCase();
    const detected = SIGNATURES.find((sig) => sig.test(file.buffer, extension));

    if (!detected) {
      throw badRequest('That file type is not supported. Attach a PDF, Word, Excel or image file.');
    }

    /*
      The path is built entirely from values this server chose.

      A UUID for the name and the sniffed type for the extension, so nothing the visitor
      supplied reaches the filesystem. Dated folders keep any one directory from growing to
      the size where listing it becomes slow.
    */
    const now = new Date();
    const storageKey = path.posix.join(
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${crypto.randomUUID()}.${detected.ext}`,
    );

    const target = resolveKey(storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // `wx` fails rather than overwrites. A UUID collision is not realistic; silently
    // replacing another enquiry's file if one happened would be.
    await fs.writeFile(target, file.buffer, { flag: 'wx' });

    logger.info({ storageKey, bytes: file.buffer.length, type: detected.mime }, 'Enquiry attachment stored');

    return {
      storageKey,
      filename: displayName(file.originalname),
      mimeType: detected.mime,
      bytes: file.buffer.length,
    };
  },

  /** Reads a stored file back, for the authenticated admin download. */
  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(resolveKey(storageKey));
  },

  /** Removes a stored file. Missing is not an error — the goal is that it is gone. */
  async remove(storageKey: string): Promise<void> {
    await fs.rm(resolveKey(storageKey), { force: true });
  },

  /** Exposed so the sweep script and the env check agree on where files live. */
  root(): string {
    return path.resolve(env.LEAD_UPLOAD_DIR);
  },
};

/**
 * Turns a stored key into an absolute path, refusing anything that escapes the directory.
 *
 * Keys are generated by `store` and should always be safe. This checks anyway, because the
 * key makes a round trip through the database in between, and a path check that only runs
 * on values believed to be trustworthy is a check that stops running the day that belief
 * turns out to be wrong.
 */
function resolveKey(storageKey: string): string {
  const root = path.resolve(env.LEAD_UPLOAD_DIR);
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw badRequest('Invalid attachment reference.');
  }
  return target;
}
