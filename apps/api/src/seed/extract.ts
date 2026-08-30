/**
 * Content extraction from the original HTML.
 *
 * The 25 source files are the source of truth for the approved content. Rather than
 * retyping any of it — which would guarantee drift — this reads the real files and pulls
 * out the same data structures the original pages rendered client-side.
 *
 * Two conversions happen on the way through, and both exist to keep design out of the
 * database:
 *   - literal hex colours become accent tokens
 *   - raw inline SVG becomes a key into a generated icon registry
 *
 * Placeholders such as `[VALUE]` and `[CLIENT NAME]` are preserved exactly. They are what
 * the source contains, and inventing real values in their place is explicitly out of scope.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { accentFromHex, type AccentToken } from '@aptentech/shared';

export interface IconRegistry {
  [key: string]: string;
}

/** Accumulates every distinct SVG body found, keyed by a stable content hash. */
export class IconCollector {
  private readonly byHash = new Map<string, string>();

  add(rawSvgInner: string | undefined | null): string {
    const body = (rawSvgInner ?? '').trim();
    if (!body) return '';
    const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 10);
    const key = `i${hash}`;
    if (!this.byHash.has(key)) this.byHash.set(key, body);
    return key;
  }

  registry(): IconRegistry {
    return Object.fromEntries([...this.byHash.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&amp;/g, '&'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&apos;/g, "'"],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&nbsp;/g, ' '],
  [/&mdash;/g, '—'],
  [/&ndash;/g, '–'],
  [/&rsquo;/g, '’'],
  [/&lsquo;/g, '‘'],
  [/&hellip;/g, '…'],
  [/&middot;/g, '·'],
  [/&times;/g, '×'],
  [/&check;/g, '✓'],
  [/&rarr;/g, '→'],
  [/&larr;/g, '←'],
];

export function decodeEntities(input: string): string {
  let out = input;
  for (const [re, replacement] of ENTITIES) out = out.replace(re, replacement);

  // Numeric references too: the source writes several glyphs that way (&#10003; for the
  // tick in the carousel's console, for example), and leaving them encoded put raw entity
  // text into the database.
  out = out.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)));
  return out;
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Reads the single inline `<script>` block that holds each page's behaviour and data. */
export function inlineScript(html: string): string {
  const blocks = [...html.matchAll(/<script(?![^>]*(?:src=|ld\+json))[^>]*>([\s\S]*?)<\/script>/g)];
  return blocks.map((m) => m[1] ?? '').join('\n');
}

/**
 * Extracts a top-level `var NAME = [...]` literal by bracket matching, then evaluates it.
 *
 * These are our own trusted source files being read at build time by a developer-run
 * script, never user input at runtime, so evaluating the literal is the pragmatic way to
 * get exact fidelity without writing a JavaScript parser.
 */
function readLiteral<T>(js: string, name: string, open: '[' | '{', close: ']' | '}'): T | null {
  const patterns = [`var ${name} = ${open}`, `var ${name}=${open}`];
  let start = -1;

  for (const pattern of patterns) {
    const idx = js.indexOf(pattern);
    if (idx >= 0) {
      start = idx + pattern.length - 1;
      break;
    }
  }
  if (start < 0) return null;

  let depth = 0;
  let end = -1;
  let inString: string | null = null;

  for (let i = start; i < js.length; i += 1) {
    const ch = js[i]!;
    const prev = js[i - 1];

    // Skip bracket characters that appear inside string literals — SVG path data is full
    // of them and would otherwise throw off the depth count.
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;

  const literal = js.slice(start, end + 1);
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return ${literal};`)() as T;
  } catch {
    return null;
  }
}

export function readArray<T = unknown>(js: string, name: string): T[] | null {
  return readLiteral<T[]>(js, name, '[', ']');
}

export function readObject<T = Record<string, unknown>>(js: string, name: string): T | null {
  return readLiteral<T>(js, name, '{', '}');
}

/* ------------------------------------------------------------------ head metadata */

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  h1: string;
  heroLede: string;
  eyebrow: string;
  h2s: string[];
}

const attr = (html: string, re: RegExp): string => {
  const m = html.match(re);
  return m?.[1] ? decodeEntities(m[1]) : '';
};

/**
 * The hero as the service and solution pages actually build it.
 *
 * Their hero is a two-column `hero-split`: a breadcrumb, an H1 whose tail is highlighted in
 * a gradient `<span class="g">`, a standfirst, a six-item tick list and a CTA with a note —
 * then the inline form beside it. That is a different structure from the homepage's
 * centred hero, and rendering one with the other's markup is what makes the layout collapse.
 */
export interface HeroSplit {
  title: string;
  titleHighlight: string;
  lede: string;
  points: string[];
  ctaLabel: string;
  ctaNote: string;
  breadcrumb: string;
}

export function readHeroSplit(html: string): HeroSplit | null {
  const section = html.match(/<section class="hero hero-split"[\s\S]*?<\/section>/);
  if (!section) return null;

  const block = section[0];
  const h1 = block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';

  // Split the H1 at the gradient span so the two halves can be rendered separately.
  const highlight = h1.match(/<span class="g">([\s\S]*?)<\/span>/)?.[1] ?? '';
  const lead = stripTags(h1.replace(/<span class="g">[\s\S]*?<\/span>/, ''));

  const cta = block.match(/<div class="hs-cta[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';

  return {
    title: lead,
    titleHighlight: stripTags(highlight),
    lede: stripTags(block.match(/<p class="hs-lede[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    points: [...block.matchAll(/<li>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/li>/g)]
      .map((m) => stripTags(m[1]!))
      .filter(Boolean),
    ctaLabel: stripTags(cta.match(/<a[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
    ctaNote: stripTags(cta.match(/<span class="note">([\s\S]*?)<\/span>/)?.[1] ?? ''),
    breadcrumb: stripTags(
      block.match(/<nav class="crumb"[\s\S]*?<span aria-current="page">([\s\S]*?)<\/span>/)?.[1] ?? '',
    ),
  };
}

export function readMeta(html: string): PageMeta {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const h1 = h1Match ? stripTags(h1Match[1]!) : '';

  // The hero standfirst is the first `.lede` paragraph after the H1.
  let heroLede = '';
  if (h1Match?.index !== undefined) {
    const after = html.slice(h1Match.index + h1Match[0].length, h1Match.index + 4000);
    const lede = after.match(/<p[^>]*class="[^"]*lede[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    if (lede) heroLede = stripTags(lede[1]!);
  }

  const eyebrowMatch = html.match(/<(?:span|p|div)[^>]*class="[^"]*eyebrow[^"]*"[^>]*>([\s\S]*?)<\/(?:span|p|div)>/);

  return {
    title: attr(html, /<title>([\s\S]*?)<\/title>/),
    description: attr(html, /<meta\s+name="description"\s+content="([\s\S]*?)"/),
    canonical: attr(html, /<link\s+rel="canonical"\s+href="([^"]*)"/),
    ogTitle: attr(html, /<meta\s+property="og:title"\s+content="([\s\S]*?)"/),
    ogDescription: attr(html, /<meta\s+property="og:description"\s+content="([\s\S]*?)"/),
    ogUrl: attr(html, /<meta\s+property="og:url"\s+content="([^"]*)"/),
    h1,
    heroLede,
    eyebrow: eyebrowMatch ? stripTags(eyebrowMatch[1]!) : '',
    h2s: [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => stripTags(m[1]!)).filter(Boolean),
  };
}

/** Images referenced by the page, so their `/images/...` paths survive into the CMS. */
export interface ImageRef {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export function readImages(html: string): ImageRef[] {
  return [...html.matchAll(/<img([^>]*)>/g)].map((m) => {
    const tag = m[1]!;
    const get = (name: string): string => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';
    const w = get('width');
    const h = get('height');
    return {
      src: get('src'),
      alt: decodeEntities(get('alt')),
      width: w ? Number(w) : null,
      height: h ? Number(h) : null,
    };
  });
}

/* ------------------------------------------------------------------ typed readers */

type RawServiceItem = { c?: string; t?: string; title?: string; d?: string; desc?: string; i?: string; icon?: string; b?: string[]; key?: string; links?: string[] };
type RawCase = {
  c?: string;
  ind?: string;
  tech?: string;
  tag?: string;
  title?: string;
  problem?: string;
  solution?: string;
  result?: string;
  metrics?: Array<[string, string]>;
  shot?: string;
  href?: string;
};
type RawFeature = { c?: string; title?: string; desc?: string; icon?: string; items?: string[] };

const text = (v: unknown): string => (typeof v === 'string' ? decodeEntities(v) : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(decodeEntities) : []);

export function readServices(js: string, icons: IconCollector) {
  const raw = readArray<RawServiceItem>(js, 'SERVICES');
  if (!raw) return [];
  return raw.map((s) => ({
    accent: accentFromHex(s.c) as AccentToken,
    title: text(s.t ?? s.title),
    description: text(s.d ?? s.desc),
    icon: icons.add(s.i ?? s.icon),
    // The homepage variant carries `links` instead of `b`; both render as the bullet list.
    bullets: list(s.b ?? s.links),
  }));
}

export function readSolutions(js: string, icons: IconCollector) {
  const raw = readArray<[string, string, boolean, string, string[]]>(js, 'SOL');
  if (!raw) return [];
  return raw
    .filter((row) => Array.isArray(row))
    .map((row) => ({
      accent: accentFromHex(row[0]) as AccentToken,
      title: text(row[1]),
      featured: Boolean(row[2]),
      icon: icons.add(row[3]),
      bullets: list(row[4]),
    }));
}

/**
 * Reads the features section, which the source expresses in two different shapes.
 *
 * Service pages use a flat `[accent, label, icon]` tuple rendered as a chip grid with a
 * "show more" toggle — the SEO page's "What an SEO engagement includes". Solution pages
 * use `{c, title, desc, icon, items}` objects rendered as grouped cards — the taxi page's
 * "Our taxi app features". They are genuinely different layouts, so the shape is detected
 * and reported alongside the items rather than flattened into one.
 */
export function readFeatures(js: string, icons: IconCollector): {
  layout: 'chips' | 'groups';
  items: Array<{ accent: AccentToken; title: string; description: string; icon: string; items: string[] }>;
} {
  const raw = readArray<RawFeature | [string, string, string]>(js, 'FEATURES');
  if (!raw || !raw.length) return { layout: 'groups', items: [] };

  const isTuple = Array.isArray(raw[0]);

  if (isTuple) {
    const rows = raw as Array<[string, string, string]>;
    return {
      layout: 'chips',
      items: rows
        .filter((row) => Array.isArray(row))
        .map((row) => ({
          accent: accentFromHex(row[0]) as AccentToken,
          title: text(row[1]),
          description: '',
          icon: icons.add(row[2]),
          items: [],
        })),
    };
  }

  const objects = raw as RawFeature[];
  return {
    layout: 'groups',
    items: objects.map((f) => ({
      accent: accentFromHex(f.c) as AccentToken,
      title: text(f.title),
      description: text(f.desc),
      icon: icons.add(f.icon),
      items: list(f.items),
    })),
  };
}

export function readTechnologies(js: string, icons: IconCollector) {
  const raw = readArray<[string, string, string, string]>(js, 'AI');
  if (!raw) return [];
  return raw
    .filter((row) => Array.isArray(row))
    .map((row) => ({
      accent: accentFromHex(row[0]) as AccentToken,
      title: text(row[1]),
      description: text(row[2]),
      icon: icons.add(row[3]),
    }));
}

export function readBadges(js: string, icons: IconCollector) {
  const raw = readArray<[string, string, string]>(js, 'BADGES');
  if (!raw) return [];
  return raw
    .filter((row) => Array.isArray(row))
    .map((row) => ({
      accent: accentFromHex(row[0]) as AccentToken,
      label: text(row[1]),
      icon: icons.add(row[2]),
    }));
}

export function readSteps(js: string) {
  const raw = readArray<[string, string, string[]]>(js, 'STEPS');
  if (!raw) return [];
  return raw
    .filter((row) => Array.isArray(row))
    .map((row) => ({ title: text(row[0]), description: text(row[1]), deliverables: list(row[2]) }));
}

export function readTechStack(js: string) {
  const raw = readArray<[string, string, string[]]>(js, 'TECH');
  if (!raw) return [];
  return raw
    .filter((row) => Array.isArray(row))
    .map((row) => ({ category: text(row[0]), accent: accentFromHex(row[1]) as AccentToken, items: list(row[2]) }));
}

export function readWhy(js: string) {
  const raw = readArray<[string, string]>(js, 'WHY');
  if (!raw) return [];
  return raw.filter((row) => Array.isArray(row)).map((row) => ({ title: text(row[0]), description: text(row[1]) }));
}

/**
 * Reads the FAQ data, which the source expresses in two different shapes.
 *
 * Service and solution pages use a flat `var FAQ = [[q, a], ...]`. The homepage instead
 * groups questions under category keys — `var FAQ = { 'About & Services': [[q, a], ...] }`
 * — because it renders a category rail beside the list. Both are normalised to the same
 * flat records here, with the homepage's category preserved on each item so the rail can
 * be rebuilt from CMS data.
 */
export function readFaqs(js: string) {
  const flat = readArray<[string, string]>(js, 'FAQ');
  if (flat) {
    return flat
      .filter((row) => Array.isArray(row))
      .map((row, index) => ({
        question: text(row[0]),
        answer: text(row[1]),
        category: '',
        order: index,
        visible: true,
      }));
  }

  const grouped = readObject<Record<string, Array<[string, string]>>>(js, 'FAQ');
  if (!grouped) return [];

  const out: Array<{ question: string; answer: string; category: string; order: number; visible: boolean }> = [];
  let order = 0;
  for (const [category, rows] of Object.entries(grouped)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      out.push({
        question: text(row[0]),
        answer: text(row[1]),
        category: decodeEntities(category),
        order: order++,
        visible: true,
      });
    }
  }
  return out;
}

export function readCases(js: string) {
  const raw = readArray<RawCase>(js, 'CASES');
  if (!raw) return [];
  return raw.map((c) => ({
    accent: accentFromHex(c.c) as AccentToken,
    industry: text(c.ind),
    techSummary: text(c.tech),
    tag: text(c.tag),
    title: text(c.title),
    problem: text(c.problem),
    solution: text(c.solution),
    result: text(c.result),
    metrics: Array.isArray(c.metrics)
      ? c.metrics.map((m) => ({ value: text(m?.[0]), label: text(m?.[1]) }))
      : [],
    shot: (['chart', 'cells', 'code'].includes(String(c.shot)) ? c.shot : 'chart') as 'chart' | 'cells' | 'code',
    detailHref: typeof c.href === 'string' ? c.href : null,
  }));
}

export function readPosts(js: string) {
  const raw = readArray<[string, string, string, string, string, string, string, string]>(js, 'POSTS');
  if (!raw) return [];
  return raw
    .filter((row) => Array.isArray(row))
    .map((row) => ({
      accent: accentFromHex(row[0]) as AccentToken,
      categoryName: text(row[1]),
      title: text(row[2]),
      excerpt: text(row[3]),
      href: text(row[4]),
      authorName: text(row[5]),
      isoDate: text(row[6]),
      displayDate: text(row[7]),
    }));
}

/* ------------------------------------------------------------------ file access */

export function sourceDir(): string {
  // The seed reads the original HTML from the repository root's sibling folder, which is
  // where the 25 approved pages live.
  const fromEnv = process.env.SOURCE_HTML_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv);

  const candidates = [
    path.resolve(process.cwd(), '../../..'),
    path.resolve(process.cwd(), '../..'),
    path.resolve(__dirname, '../../../../..'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'aptentech-homepage.html'))) return dir;
  }
  throw new Error(
    'Could not locate the original HTML files. Set SOURCE_HTML_DIR to the folder containing aptentech-homepage.html',
  );
}

export function readSource(filename: string): string {
  return fs.readFileSync(path.join(sourceDir(), filename), 'utf8');
}

export function slugFromCanonical(canonical: string): string {
  const trimmed = canonical.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
