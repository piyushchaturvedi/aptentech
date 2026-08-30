import { mediaRepository } from '../repositories/system.repository';
import { mediaService } from './media.service';

/**
 * Turns stored documents into what the site can render.
 *
 * Content stores a `MediaRef` holding a `mediaId`, not a URL, so that moving buckets or
 * putting a CDN in front later is a configuration change rather than a data migration.
 * Resolution happens here, once per request, in a single batched lookup — doing it in the
 * web app would mean either an N+1 or leaking storage details into the frontend.
 *
 * When no asset has been uploaded yet, `url` is null and `legacyPath` still carries the
 * original `/images/...` path from the source HTML. The renderer uses the recorded width
 * and height to draw a placeholder of exactly the right size, so the layout is identical
 * whether or not the image exists — which is what lets the site ship before AptenTech
 * supplies the 37 missing files.
 */

interface RawMediaRef {
  mediaId?: string | null;
  legacyPath?: string | null;
  alt?: string;
  width?: number | null;
  height?: number | null;
  [k: string]: unknown;
}

const isMediaRef = (v: unknown): v is RawMediaRef =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && ('mediaId' in v || 'legacyPath' in v);

/** Walks any document shape and collects every media id that needs resolving. */
function collectIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectIds(item, out);
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  if (isMediaRef(node) && typeof node.mediaId === 'string' && node.mediaId) {
    out.add(node.mediaId);
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    collectIds(value, out);
  }
}

function attachUrls(node: unknown, urls: Map<string, { url: string; alt: string; width: number | null; height: number | null }>): unknown {
  if (Array.isArray(node)) return node.map((item) => attachUrls(item, urls));
  if (typeof node !== 'object' || node === null) return node;

  if (isMediaRef(node)) {
    const id = typeof node.mediaId === 'string' ? node.mediaId : null;
    const asset = id ? urls.get(id) : undefined;
    return {
      ...node,
      url: asset?.url ?? null,
      // The CMS alt overrides the asset's default alt when an editor has written one.
      alt: node.alt || asset?.alt || '',
      width: node.width ?? asset?.width ?? null,
      height: node.height ?? asset?.height ?? null,
    };
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = attachUrls(value, urls);
  }
  return out;
}

export const hydrateService = {
  /** Resolves every media reference in a document (or array of documents) in one query. */
  async media<T>(input: T): Promise<T> {
    const ids = new Set<string>();
    collectIds(input, ids);
    if (ids.size === 0) return attachUrls(input, new Map()) as T;

    const assets = await mediaRepository.findByIds([...ids]);
    const map = new Map(
      assets.map((a) => [
        a.id,
        { url: mediaService.publicUrl(a.key), alt: a.alt ?? '', width: a.width ?? null, height: a.height ?? null },
      ]),
    );

    return attachUrls(input, map) as T;
  },
};
