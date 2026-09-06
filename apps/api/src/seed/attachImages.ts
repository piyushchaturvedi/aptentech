/**
 * Points every image slot at a stored asset.
 *
 * Two passes, because the two facts live in different places: the content documents know
 * *where* an image belongs and what size it is, and the media collection knows *what* is
 * available. This walks every document, collects the slots, has `seedDemoImages` produce one
 * asset per distinct slot, then writes the `mediaId` back.
 *
 * The write is deliberately narrow — only `mediaId`, and only where the slot has none. An
 * admin who has already uploaded a real photograph keeps it, and re-running the seed after
 * that does not undo their work.
 */
import {
  BlogPostModel,
  CaseStudyModel,
  ServicePageModel,
  SitePageModel,
  SiteSettingsModel,
  TestimonialModel,
} from '../models';
import { seedDemoImages, storeSvg, logoSvg, ogSvg } from './demoImages';
import { logger } from '../utils/logger';

interface Slot {
  legacyPath: string;
  width: number;
  height: number;
  alt: string;
}

const isMediaRef = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && ('mediaId' in v || 'legacyPath' in v);

/** Collects every slot that has a source path but no asset behind it yet. */
function collect(node: unknown, out: Map<string, Slot>): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  if (isMediaRef(node)) {
    const legacyPath = typeof node.legacyPath === 'string' ? node.legacyPath : '';
    if (legacyPath && !node.mediaId && !out.has(legacyPath)) {
      out.set(legacyPath, {
        legacyPath,
        width: typeof node.width === 'number' ? node.width : 800,
        height: typeof node.height === 'number' ? node.height : 600,
        alt: typeof node.alt === 'string' ? node.alt : '',
      });
    }
  }

  for (const value of Object.values(node as Record<string, unknown>)) collect(value, out);
}

/** Writes `mediaId` into every ref whose `legacyPath` now has an asset. Returns how many. */
function attach(node: unknown, assets: Map<string, { mediaId: string }>): number {
  if (Array.isArray(node)) return node.reduce<number>((n, item) => n + attach(item, assets), 0);
  if (typeof node !== 'object' || node === null) return 0;

  let changed = 0;

  if (isMediaRef(node)) {
    const legacyPath = typeof node.legacyPath === 'string' ? node.legacyPath : '';
    const asset = legacyPath ? assets.get(legacyPath) : undefined;
    if (asset && !node.mediaId) {
      node.mediaId = asset.mediaId;
      changed += 1;
    }
  }

  for (const value of Object.values(node as Record<string, unknown>)) changed += attach(value, assets);
  return changed;
}

/*
  Typed loosely on purpose.

  These five models have unrelated document shapes, so a union of them offers no callable
  `find`. Nothing here reads a field by name — the walk is structural — so the document type
  genuinely does not matter, and asserting a common one would be a fiction.
*/
type AnyModel = { find: (filter: Record<string, never>) => { lean: () => Promise<unknown[]> } & Promise<unknown[]> };

const COLLECTIONS: AnyModel[] = [
  ServicePageModel,
  SitePageModel,
  CaseStudyModel,
  BlogPostModel,
  TestimonialModel,
] as unknown as AnyModel[];

/** Marks every top-level field dirty, since the structural walk may have changed any of them. */
function markAll(doc: { markModified: (path: string) => void }, obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (key !== '_id' && key !== '__v') doc.markModified(key);
  }
}

/**
 * Image slots the source never named, but which the design still renders a frame for.
 *
 * The 82 slots handled above all carried a `legacyPath` — the source referenced a file that
 * was never delivered. These are different: nothing was ever referenced, so the frame renders
 * its "Recommended 4:5 · alt text describes the work shown" prompt instead, which is the
 * placeholder a visitor sees on the about page.
 *
 * Sizes come from the aspect ratio each frame's own hint asks for, so a real upload later
 * drops in without reflowing anything.
 */
const EXTRA_SLOTS = [
  {
    collection: 'sitepages' as const,
    match: { slug: 'about' },
    // `blocks.<n>.image`, located by block type rather than by index, which shifts when an
    // editor reorders the page.
    blockType: 'storyBand',
    width: 560,
    height: 700,
    alt: 'AptenTech engineering team at work',
    art: '/images/about-story.jpg',
  },
];

export async function attachDemoImages(): Promise<{ generated: number; attached: number }> {
  const slots = new Map<string, Slot>();

  for (const model of COLLECTIONS) {
    const docs = await model.find({}).lean();
    for (const doc of docs) collect(doc, slots);
  }

  const settings = await SiteSettingsModel.findOne({ singleton: 'site' }).lean();
  if (settings) collect(settings, slots);

  /*
    Slots with no source path of their own.

    Registered here so `seedDemoImages` produces artwork for them in the same pass, and so the
    `legacyPath` it is keyed on is written onto the document below — which is what makes the
    whole thing idempotent, exactly like the slots the source did name.
  */
  for (const extra of EXTRA_SLOTS) {
    if (!slots.has(extra.art)) {
      slots.set(extra.art, { legacyPath: extra.art, width: extra.width, height: extra.height, alt: extra.alt });
    }
  }

  /*
    Every page whose positioning section has no image.

    The 36 generated menu pages inherit that section's shape from the page they draw on but
    carry no asset of their own. They do not render it today — it is not in their section
    order — so this is not a visible gap; filling it means enabling the section from the CMS
    produces a finished page rather than an empty frame.
  */
  const ctaSlot = '/images/section-cta.jpg';
  const needsCta = (await ServicePageModel.find({}).select('midCta2Image midCta2MediaLabel').lean()).some(
    (p) => {
      const page = p as { midCta2Image?: { mediaId?: unknown }; midCta2MediaLabel?: string };
      // Only pages that actually render the band — the label is what the frame shows.
      return Boolean(page.midCta2MediaLabel) && !page.midCta2Image?.mediaId;
    },
  );
  if (needsCta && !slots.has(ctaSlot)) {
    slots.set(ctaSlot, { legacyPath: ctaSlot, width: 420, height: 340, alt: 'What the engagement produces' });
  }

  const positioningSlot = '/images/section-positioning.jpg';
  const needsPositioning = (await ServicePageModel.find({}).select('positioningImage').lean()).some(
    (p) => !(p as { positioningImage?: { mediaId?: unknown } }).positioningImage?.mediaId,
  );
  if (needsPositioning && !slots.has(positioningSlot)) {
    slots.set(positioningSlot, {
      legacyPath: positioningSlot,
      width: 520,
      height: 420,
      alt: 'How the work is delivered',
    });
  }

  const assets = await seedDemoImages([...slots.values()]);

  let attached = 0;

  for (const model of COLLECTIONS) {
    const docs = (await model.find({})) as Array<{ toObject: () => Record<string, unknown>; set: (v: unknown) => void; markModified: (p: string) => void; save: () => Promise<unknown> }>;
    for (const doc of docs) {
      const obj = doc.toObject();
      const changed = attach(obj, assets);
      if (changed > 0) {
        /*
          Each touched path is marked explicitly.

          Mongoose does not track mutations made to a plain object taken out of a document, so
          without this the `save()` writes nothing and the pass silently does nothing. Marking
          the empty path is not the shorthand it looks like — MongoDB rejects that outright
          with "An empty update path is not valid", which is how this was found.
        */
        doc.set(obj);
        markAll(doc, obj);
        await doc.save();
        attached += changed;
      }
    }
  }

  /* --------------------------------------------------------------- unnamed slots */

  for (const extra of EXTRA_SLOTS) {
    const asset = assets.get(extra.art);
    if (!asset) continue;

    const page = await SitePageModel.findOne(extra.match);
    if (!page) continue;

    /*
      Read the whole document as a plain object first.

      Reaching into a Mongoose `DocumentArray` and spreading one of its subdocuments copies
      the internal `_doc` accessors along with the data, and reading those recurses until the
      stack gives out — which is what "Maximum call stack size exceeded" was. `toObject()`
      flattens the whole tree once, and the same set/markModified pattern used above writes it
      back.
    */
    const obj = page.toObject() as Record<string, unknown>;
    const blocks = (obj.blocks ?? []) as Array<Record<string, unknown>>;
    const index = blocks.findIndex((b) => b.type === extra.blockType);
    if (index < 0) continue;

    const current = (blocks[index]?.image ?? {}) as Record<string, unknown>;
    if (current.mediaId) continue;

    blocks[index] = {
      ...blocks[index],
      image: {
        mediaId: asset.mediaId,
        legacyPath: extra.art,
        alt: extra.alt,
        width: extra.width,
        height: extra.height,
      },
    };

    page.set(obj);
    markAll(page, obj);
    await page.save();
    attached += 1;
  }

  const cta = assets.get(ctaSlot);
  if (cta) {
    const pages = await ServicePageModel.find({}).select('midCta2Image midCta2MediaLabel');
    for (const page of pages) {
      const obj = page.toObject() as Record<string, unknown>;
      if (!obj.midCta2MediaLabel) continue;
      if ((obj.midCta2Image as { mediaId?: unknown } | undefined)?.mediaId) continue;

      obj.midCta2Image = {
        mediaId: cta.mediaId,
        legacyPath: ctaSlot,
        alt: 'What the engagement produces',
        width: 420,
        height: 340,
      };

      page.set(obj);
      markAll(page, obj);
      await page.save();
      attached += 1;
    }
  }

  const positioning = assets.get(positioningSlot);
  if (positioning) {
    const pages = await ServicePageModel.find({}).select('positioningImage');
    for (const page of pages) {
      const obj = page.toObject() as Record<string, unknown>;
      const current = (obj.positioningImage ?? {}) as Record<string, unknown>;
      if (current.mediaId) continue;

      obj.positioningImage = {
        mediaId: positioning.mediaId,
        legacyPath: positioningSlot,
        alt: 'How the work is delivered',
        width: 520,
        height: 420,
      };

      page.set(obj);
      markAll(page, obj);
      await page.save();
      attached += 1;
    }
  }

  /* --------------------------------------------------------------- brand assets */

  const companyName = settings?.companyName || 'AptenTech';

  const logo = await storeSvg('aptentech-logo.svg', logoSvg(), 256, 256, `${companyName} logo`);
  const favicon = await storeSvg('aptentech-favicon.svg', logoSvg(), 64, 64, `${companyName} icon`);
  const og = await storeSvg('aptentech-og-card.svg', ogSvg(companyName), 1200, 630, `${companyName}`);

  const doc = await SiteSettingsModel.findOne({ singleton: 'site' });
  if (doc) {
    const obj = doc.toObject() as Record<string, unknown>;
    let touched = attach(obj, assets);

    const setRef = (field: string, ref: { mediaId: string }, width: number, height: number, alt: string) => {
      const current = (obj[field] ?? {}) as Record<string, unknown>;
      if (!current.mediaId) {
        obj[field] = { ...current, mediaId: ref.mediaId, width, height, alt };
        touched += 1;
      }
    };

    setRef('logo', logo, 256, 256, `${companyName} logo`);
    setRef('favicon', favicon, 64, 64, `${companyName} icon`);

    const seo = (obj.defaultSeo ?? {}) as Record<string, unknown>;
    const ogImage = (seo.ogImage ?? {}) as Record<string, unknown>;
    if (!ogImage.mediaId) {
      obj.defaultSeo = { ...seo, ogImage: { ...ogImage, mediaId: og.mediaId, width: 1200, height: 630, alt: companyName } };
      touched += 1;
    }

    if (touched > 0) {
      doc.set(obj);
      markAll(doc, obj);
      await doc.save();
      attached += touched;
    }
  }

  logger.info({ generated: assets.size, attached }, 'Demo images attached to content');
  return { generated: assets.size, attached };
}
