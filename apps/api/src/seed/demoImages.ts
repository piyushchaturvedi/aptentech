/**
 * Demo imagery, generated rather than sourced.
 *
 * The source pages reference 82 images and none were delivered. Rather than leave every slot
 * showing its "upload in admin" placeholder, this draws an on-brand SVG for each one at the
 * exact dimensions the slot records, stores it through the normal media pipeline, and points
 * the content at it. Uploading a real file from `/admin/media` replaces it with no code
 * change, because nothing here is hardcoded into a component.
 *
 * **Why abstract artwork and not photographs.** Three of the four image families are named
 * `*-team.jpg` and `aptentech-office.jpg`. A stock photograph of strangers presented as
 * AptenTech's team, or of a building presented as its office, is exactly the kind of fake
 * real-world claim this project is not allowed to make — it would be a picture asserting
 * something untrue about the company, and it would sit there looking credible until someone
 * noticed. Abstract compositions in the site's own palette fill the same space, carry the
 * same visual weight, and are honestly what they are: placeholder art awaiting real photos.
 *
 * Every image is deterministic — the same filename always produces the same picture — so a
 * re-seed does not silently reshuffle the site's appearance.
 */
import crypto from 'node:crypto';
import { MediaModel } from '../models';
import { mediaService } from '../services/media.service';
import { logger } from '../utils/logger';

/** The site's own palette, so generated art cannot drift from the approved design. */
const PALETTE = {
  primary: '#3A31DB',
  primary700: '#2A22B3',
  violet: '#7C4DFF',
  accent: '#00C9A7',
  cyan: '#14B8E4',
  amber: '#FF9D2E',
  pink: '#F0468A',
  ink: '#0C0E24',
  ink2: '#151838',
} as const;

const ACCENTS = [PALETTE.accent, PALETTE.cyan, PALETTE.violet, PALETTE.amber, PALETTE.pink] as const;

/**
 * A deterministic pseudo-random stream seeded from the filename.
 *
 * Determinism is the point: re-running the seed must not repaint the site, or a rebuild
 * would silently change every page's imagery.
 */
function rng(seed: string): () => number {
  let h = parseInt(crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
  return () => {
    // xorshift32 — small, fast, and stable across Node versions, which `Math.random` is not.
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100_000) / 100_000;
  };
}

/** Shared background: the dark brand gradient with the same dot grid the site uses. */
function backdrop(w: number, h: number, id: string, accent: string): string {
  return `
  <defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PALETTE.ink}"/>
      <stop offset="0.55" stop-color="${PALETTE.ink2}"/>
      <stop offset="1" stop-color="${PALETTE.primary700}"/>
    </linearGradient>
    <radialGradient id="gl${id}" cx="0.78" cy="0.18" r="0.75">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dot${id}" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="#fff" fill-opacity="0.10"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg${id})"/>
  <rect width="${w}" height="${h}" fill="url(#dot${id})"/>
  <rect width="${w}" height="${h}" fill="url(#gl${id})"/>`;
}

/**
 * The "team" family (640×620).
 *
 * Overlapping translucent panels and connector lines — the visual language of people working
 * on one system, without depicting people who do not exist.
 */
function teamArt(w: number, h: number, seed: string): string {
  const r = rng(seed);
  const id = seed.replace(/[^a-z0-9]/gi, '').slice(-8);
  const accent = ACCENTS[Math.floor(r() * ACCENTS.length)] ?? PALETTE.accent;
  const second = ACCENTS[Math.floor(r() * ACCENTS.length)] ?? PALETTE.cyan;

  const cards: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const cw = w * (0.34 + r() * 0.16);
    const ch = h * (0.17 + r() * 0.1);
    const x = w * (0.1 + r() * 0.4);
    const y = h * (0.16 + i * 0.24 + r() * 0.05);
    cards.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="14"
         fill="#ffffff" fill-opacity="${(0.07 + r() * 0.05).toFixed(3)}" stroke="#ffffff" stroke-opacity="0.16"/>
       <rect x="${(x + 16).toFixed(1)}" y="${(y + 14).toFixed(1)}" width="${(cw * 0.42).toFixed(1)}" height="8" rx="4"
         fill="${i === 1 ? second : accent}" fill-opacity="0.85"/>
       <rect x="${(x + 16).toFixed(1)}" y="${(y + 32).toFixed(1)}" width="${(cw * 0.66).toFixed(1)}" height="6" rx="3"
         fill="#ffffff" fill-opacity="0.24"/>`,
    );
  }

  const nodes: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const cx = w * (0.62 + r() * 0.3);
    const cy = h * (0.14 + r() * 0.72);
    nodes.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(5 + r() * 8).toFixed(1)}"
         fill="${accent}" fill-opacity="${(0.4 + r() * 0.45).toFixed(2)}"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  ${backdrop(w, h, id, accent)}
  <g>${cards.join('')}</g>
  <g>${nodes.join('')}</g>
</svg>`;
}

/**
 * The "architecture / dashboard" family (520×420).
 *
 * A panel with a plotted series and a small node graph — what the slots are captioned as
 * (matching engines, routing, evaluation dashboards), drawn abstractly.
 */
function dashboardArt(w: number, h: number, seed: string): string {
  const r = rng(seed);
  const id = seed.replace(/[^a-z0-9]/gi, '').slice(-8);
  const accent = ACCENTS[Math.floor(r() * ACCENTS.length)] ?? PALETTE.cyan;

  const px = w * 0.09;
  const py = h * 0.14;
  const pw = w * 0.82;
  const ph = h * 0.56;

  const points: string[] = [];
  const bars: string[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i += 1) {
    const x = px + (pw / steps) * i;
    const y = py + ph - ph * (0.18 + r() * 0.66);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    const bh = ph * (0.12 + r() * 0.4);
    bars.push(
      `<rect x="${(x - pw / steps / 3).toFixed(1)}" y="${(py + ph - bh).toFixed(1)}"
         width="${(pw / steps / 1.6).toFixed(1)}" height="${bh.toFixed(1)}" rx="3"
         fill="#ffffff" fill-opacity="0.10"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  ${backdrop(w, h, id, accent)}
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="16"
    fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.14"/>
  <g>${bars.join('')}</g>
  <polyline points="${points.join(' ')}" fill="none" stroke="${accent}" stroke-width="3"
    stroke-linecap="round" stroke-linejoin="round"/>
  ${points
    .filter((_, i) => i % 3 === 0)
    .map((p) => {
      const [x, y] = p.split(',');
      return `<circle cx="${x}" cy="${y}" r="4.5" fill="${accent}"/>`;
    })
    .join('')}
  <g transform="translate(${px}, ${(py + ph + h * 0.08).toFixed(1)})">
    ${[0, 1, 2]
      .map(
        (i) =>
          `<rect x="${(i * (pw / 3)).toFixed(1)}" y="0" width="${(pw / 3 - 12).toFixed(1)}" height="${(h * 0.11).toFixed(
            1,
          )}" rx="10" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.12"/>
           <rect x="${(i * (pw / 3) + 12).toFixed(1)}" y="${(h * 0.035).toFixed(1)}" width="${(pw / 3 * 0.4).toFixed(
             1,
           )}" height="7" rx="3.5" fill="${i === 1 ? accent : '#ffffff'}" fill-opacity="${i === 1 ? 0.9 : 0.28}"/>`,
      )
      .join('')}
  </g>
</svg>`;
}

/**
 * The blog-cover family (760×520).
 *
 * A wide gradient field with a soft geometric motif — enough character that 51 covers do not
 * look identical, quiet enough that the card's own headline stays the thing you read.
 */
function coverArt(w: number, h: number, seed: string): string {
  const r = rng(seed);
  const id = seed.replace(/[^a-z0-9]/gi, '').slice(-8);
  const accent = ACCENTS[Math.floor(r() * ACCENTS.length)] ?? PALETTE.violet;

  const shapes: string[] = [];
  const kind = Math.floor(r() * 3);

  if (kind === 0) {
    for (let i = 0; i < 4; i += 1) {
      const rad = w * (0.1 + r() * 0.18);
      shapes.push(
        `<circle cx="${(w * (0.2 + r() * 0.65)).toFixed(1)}" cy="${(h * (0.2 + r() * 0.6)).toFixed(1)}"
           r="${rad.toFixed(1)}" fill="none" stroke="${accent}" stroke-opacity="${(0.2 + r() * 0.35).toFixed(2)}"
           stroke-width="${(1.5 + r() * 2).toFixed(1)}"/>`,
      );
    }
  } else if (kind === 1) {
    for (let i = 0; i < 7; i += 1) {
      const x = w * (0.12 + i * 0.11);
      const bh = h * (0.12 + r() * 0.46);
      shapes.push(
        `<rect x="${x.toFixed(1)}" y="${(h * 0.72 - bh).toFixed(1)}" width="${(w * 0.055).toFixed(1)}"
           height="${bh.toFixed(1)}" rx="8" fill="${accent}" fill-opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`,
      );
    }
  } else {
    const pts: string[] = [];
    for (let i = 0; i <= 6; i += 1) {
      pts.push(`${(w * (0.1 + i * 0.135)).toFixed(1)},${(h * (0.25 + r() * 0.45)).toFixed(1)}`);
    }
    shapes.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${accent}" stroke-opacity="0.75"
         stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    shapes.push(
      ...pts.map((p) => {
        const [x, y] = p.split(',');
        return `<circle cx="${x}" cy="${y}" r="6" fill="${accent}" fill-opacity="0.9"/>`;
      }),
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  ${backdrop(w, h, id, accent)}
  <g>${shapes.join('')}</g>
</svg>`;
}

/** The mark used in the header, drawn to the same geometry the component already renders. */
export function logoSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 32 32" fill="none" role="img">
  <rect width="32" height="32" rx="8" fill="${PALETTE.primary}"/>
  <path d="M9 21.5 16 10l7 11.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16" cy="23" r="2.4" fill="${PALETTE.accent}"/>
</svg>`;
}

/** A 1200×630 card for link previews, carrying the mark and the company name. */
export function ogSvg(companyName: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img">
  ${backdrop(1200, 630, 'og', PALETTE.accent)}
  <g transform="translate(88, 250)">
    <rect width="72" height="72" rx="18" fill="${PALETTE.primary}"/>
    <path d="M20 48 36 22l16 26" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="36" cy="51" r="5.4" fill="${PALETTE.accent}"/>
    <text x="96" y="52" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="52" font-weight="700"
      fill="#ffffff">${companyName.replace(/[<&>]/g, '')}</text>
  </g>
</svg>`;
}

/** Chooses the family from the slot's recorded size, which encodes what the image is for. */
function artFor(path: string, width: number, height: number): string {
  if (path.includes('/blog/')) return coverArt(width, height, path);
  if (width === 640 || height >= 600) return teamArt(width, height, path);
  return dashboardArt(width, height, path);
}

export interface GeneratedImage {
  legacyPath: string;
  mediaId: string;
  width: number;
  height: number;
}

/**
 * Generates and stores one image per slot, skipping any that already exists.
 *
 * Storage goes through `mediaService.store`, the same path an admin upload takes, so these
 * assets are ordinary media records — listable, replaceable and deletable from `/admin/media`
 * with no special handling.
 */
export async function seedDemoImages(
  slots: Array<{ legacyPath: string; width: number; height: number; alt: string }>,
): Promise<Map<string, GeneratedImage>> {
  const byPath = new Map<string, GeneratedImage>();

  for (const slot of slots) {
    const filename = `${slot.legacyPath.replace(/^\/images\//, '').replace(/\//g, '-').replace(/\.jpg$/, '')}.svg`;

    // A media record already carrying this filename is either a previous run's output or an
    // admin's replacement. Either way it is left alone.
    const existing = await MediaModel.findOne({ filename }).lean();
    if (existing) {
      byPath.set(slot.legacyPath, {
        legacyPath: slot.legacyPath,
        mediaId: String(existing._id),
        width: existing.width ?? slot.width,
        height: existing.height ?? slot.height,
      });
      continue;
    }

    const svg = artFor(slot.legacyPath, slot.width, slot.height);
    const stored = await mediaService.store({
      buffer: Buffer.from(svg, 'utf8'),
      originalname: filename,
      mimetype: 'image/svg+xml',
    });

    const doc = await MediaModel.create({
      key: stored.key,
      filename,
      mimeType: 'image/svg+xml',
      bytes: Buffer.byteLength(svg),
      width: slot.width,
      height: slot.height,
      alt: slot.alt,
    });

    byPath.set(slot.legacyPath, {
      legacyPath: slot.legacyPath,
      mediaId: String(doc._id),
      width: slot.width,
      height: slot.height,
    });
  }

  logger.info({ images: byPath.size }, 'Demo images generated');
  return byPath;
}

/** Stores a standalone asset (logo, favicon, OG card) and returns its media id. */
export async function storeSvg(filename: string, svg: string, width: number, height: number, alt: string) {
  const existing = await MediaModel.findOne({ filename }).lean();
  if (existing) return { mediaId: String(existing._id), width: existing.width ?? width, height: existing.height ?? height };

  const stored = await mediaService.store({
    buffer: Buffer.from(svg, 'utf8'),
    originalname: filename,
    mimetype: 'image/svg+xml',
  });

  const doc = await MediaModel.create({
    key: stored.key,
    filename,
    mimeType: 'image/svg+xml',
    bytes: Buffer.byteLength(svg),
    width,
    height,
    alt,
  });

  return { mediaId: String(doc._id), width, height };
}
