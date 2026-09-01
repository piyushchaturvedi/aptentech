import { FilterQuery, Types, trusted } from 'mongoose';
import {
  BlogCategoryModel,
  BlogPostModel,
  CaseStudyModel,
  FaqModel,
  ServicePageModel,
  SitePageModel,
  TestimonialModel,
} from '../models';
import type { ServiceKind } from '@aptentech/shared';

/**
 * Data access for content.
 *
 * Public reads are always constrained to `status: 'PUBLISHED'` here rather than in a
 * controller, so there is no route through which a draft can leak to the public site.
 * Every list query is bounded and index-backed — none of these can degrade into a
 * collection scan as content grows.
 */

const PUBLIC = { status: 'PUBLISHED' } as const;

/**
 * Converts Mongo values into JSON the API contract describes.
 *
 * ObjectIds and Dates survive `.lean()` as class instances and serialise as objects, not
 * strings — so a reference array like `caseStudyIds` came back as `[{}, {}]` and failed
 * validation when the admin sent the same document straight back. Reads and writes have to
 * agree on the shape, so ids and dates are flattened to strings here, once, for every
 * document that leaves a repository.
 */
function serialise(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // ObjectId — identified by its marker rather than by importing the class, so this also
  // covers ids that arrive from a different driver instance.
  if (typeof value === 'object' && (value as { _bsontype?: string })._bsontype === 'ObjectId') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) out[key] = serialise(v);
    return out;
  }
  return value;
}

/** Strips Mongo internals and normalises `_id` to `id` for the API contract. */
export function toDto<T extends { _id: unknown }>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc as T & Record<string, unknown>;
  return { ...(serialise(rest) as Omit<T, '_id'>), id: String(_id) };
}

export const contentRepository = {
  /* ---------------------------------------------------------------- service pages */

  async listServicePages(kind: ServiceKind, includeDrafts = false) {
    const filter: FilterQuery<unknown> = includeDrafts ? { kind } : { kind, ...PUBLIC };
    const docs = await ServicePageModel.find(filter)
      .select('slug kind name order status heroTitle heroDescription seo updatedAt')
      .sort({ order: 1, name: 1 })
      .lean();
    return docs.map(toDto);
  },

  async findServicePageBySlug(kind: ServiceKind, slug: string, includeDrafts = false) {
    const filter = includeDrafts ? { kind, slug } : { kind, slug, ...PUBLIC };
    const doc = await ServicePageModel.findOne(filter).lean();
    return doc ? toDto(doc) : null;
  },

  async findServicePageById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ServicePageModel.findById(id).lean();
    return doc ? toDto(doc) : null;
  },

  async listAllServiceSlugs() {
    const docs = await ServicePageModel.find(PUBLIC).select('slug kind updatedAt').lean();
    return docs.map((d) => ({ slug: d.slug, kind: d.kind as ServiceKind, updatedAt: d.updatedAt }));
  },

  async createServicePage(data: Record<string, unknown>) {
    const doc = await ServicePageModel.create(data);
    return toDto(doc.toObject());
  },

  async updateServicePage(id: string, data: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ServicePageModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    return doc ? toDto(doc) : null;
  },

  async deleteServicePage(id: string) {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await ServicePageModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },

  /* ---------------------------------------------------------------- site pages */

  async findPageBySlug(slug: string, includeDrafts = false) {
    const filter = includeDrafts ? { slug } : { slug, ...PUBLIC };
    const doc = await SitePageModel.findOne(filter).lean();
    return doc ? toDto(doc) : null;
  },

  async listPages(includeDrafts = false) {
    const docs = await SitePageModel.find(includeDrafts ? {} : PUBLIC)
      .select('slug title status seo updatedAt')
      .sort({ slug: 1 })
      .lean();
    return docs.map(toDto);
  },

  async updatePageBySlug(slug: string, data: Record<string, unknown>) {
    const doc = await SitePageModel.findOneAndUpdate({ slug }, { $set: data }, { new: true, runValidators: true }).lean();
    return doc ? toDto(doc) : null;
  },

  /* ---------------------------------------------------------------- case studies */

  async listCaseStudies(opts: { includeDrafts?: boolean; category?: string; limit?: number; page?: number } = {}) {
    const { includeDrafts = false, category, limit = 24, page = 1 } = opts;
    // The public index lists only the case studies flagged for it; the rest exist to fill
    // the carousels on individual service and solution pages. Admin listings show both.
    const filter: Record<string, unknown> = includeDrafts ? {} : { ...PUBLIC, showInIndex: true };
    if (category) filter.category = category;

    const [items, total] = await Promise.all([
      CaseStudyModel.find(filter)
        .sort({ featured: -1, order: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CaseStudyModel.countDocuments(filter),
    ]);
    return { items: items.map(toDto), total };
  },

  async findCaseStudiesByIds(ids: string[]) {
    const valid = ids.filter((i) => Types.ObjectId.isValid(i));
    if (!valid.length) return [];
    const docs = await CaseStudyModel.find({ _id: trusted({ $in: valid }), ...PUBLIC }).lean();
    // Preserve the order the page specified rather than Mongo's natural order.
    const byId = new Map(docs.map((d) => [String(d._id), toDto(d)]));
    return valid.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  },

  async findCaseStudyBySlug(slug: string, includeDrafts = false) {
    const doc = await CaseStudyModel.findOne(includeDrafts ? { slug } : { slug, ...PUBLIC }).lean();
    return doc ? toDto(doc) : null;
  },

  async createCaseStudy(data: Record<string, unknown>) {
    const doc = await CaseStudyModel.create(data);
    return toDto(doc.toObject());
  },

  async updateCaseStudy(id: string, data: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await CaseStudyModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    return doc ? toDto(doc) : null;
  },

  async deleteCaseStudy(id: string) {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await CaseStudyModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },

  /* ---------------------------------------------------------------- blog */

  async listBlogPosts(opts: {
    includeDrafts?: boolean;
    page?: number;
    pageSize?: number;
    category?: string;
    tag?: string;
    search?: string;
    status?: string;
  } = {}) {
    const { includeDrafts = false, page = 1, pageSize = 9, category, tag, search, status } = opts;
    const filter: Record<string, unknown> = includeDrafts ? {} : { ...PUBLIC };
    if (category) filter.categoryName = category;
    if (tag) filter.tags = tag;
    if (status) filter.status = status;

    /*
      Substring search rather than the text index.

      The admin list searches as you type, and a text index matches whole words only — typing
      "deliv" would find nothing until "delivery" was complete, which reads as a broken box.
      The input is escaped before it becomes a pattern so a stray `(` cannot throw, and the
      collection is small enough that the scan is not worth an index.
    */
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[]\]/g, '\    const { includeDrafts = false, page = 1, pageSize = 9, category, tag, search } = opts;
    const filter: Record<string, unknown> = includeDrafts ? {} : { ...PUBLIC };
    if (category) filter.categoryName = category;
    if (tag) filter.tags = tag;
    if (search) filter.$text = trusted({ $search: search });');
      filter.$or = trusted([
        { title: { $regex: safe, $options: 'i' } },
        { slug: { $regex: safe, $options: 'i' } },
        { excerpt: { $regex: safe, $options: 'i' } },
        { categoryName: { $regex: safe, $options: 'i' } },
      ]);
    }

    const [items, total] = await Promise.all([
      BlogPostModel.find(filter)
        .select('-body')
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      BlogPostModel.countDocuments(filter),
    ]);
    return { items: items.map(toDto), total };
  },

  /**
   * How many articles sit in each status, for the list screen tabs.
   *
   * Counted server-side rather than derived from the current page, which would only ever
   * describe the 25 rows on screen.
   */
  async blogStatusCounts(): Promise<Record<string, number>> {
    const rows = await BlogPostModel.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const counts: Record<string, number> = { ALL: 0, PUBLISHED: 0, DRAFT: 0, ARCHIVED: 0 };
    for (const row of rows as Array<{ _id: string; n: number }>) {
      counts[row._id] = row.n;
      counts.ALL += row.n;
    }
    return counts;
  },

  async findBlogPostBySlug(slug: string, includeDrafts = false) {
    const doc = await BlogPostModel.findOne(includeDrafts ? { slug } : { slug, ...PUBLIC }).lean();
    return doc ? toDto(doc) : null;
  },

  async findBlogPostById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await BlogPostModel.findById(id).lean();
    return doc ? toDto(doc) : null;
  },

  async listBlogSlugs() {
    const docs = await BlogPostModel.find(PUBLIC).select('slug updatedAt publishedAt').lean();
    return docs.map((d) => ({ slug: d.slug, updatedAt: d.updatedAt, publishedAt: d.publishedAt }));
  },

  async createBlogPost(data: Record<string, unknown>) {
    const doc = await BlogPostModel.create(data);
    return toDto(doc.toObject());
  },

  async updateBlogPost(id: string, data: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await BlogPostModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    return doc ? toDto(doc) : null;
  },

  async deleteBlogPost(id: string) {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await BlogPostModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },

  async listBlogCategories() {
    const docs = await BlogCategoryModel.find().sort({ name: 1 }).lean();
    return docs.map(toDto);
  },

  async upsertBlogCategory(slug: string, data: Record<string, unknown>) {
    const doc = await BlogCategoryModel.findOneAndUpdate(
      { slug },
      { $set: data },
      { new: true, upsert: true, runValidators: true },
    ).lean();
    return doc ? toDto(doc) : null;
  },

  /* ---------------------------------------------------------------- testimonials & faqs */

  async listTestimonials(opts: { includeHidden?: boolean; attachedTo?: string } = {}) {
    const filter: Record<string, unknown> = opts.includeHidden ? {} : { visible: true };
    if (opts.attachedTo) filter.attachedTo = opts.attachedTo;
    const docs = await TestimonialModel.find(filter).sort({ order: 1, createdAt: -1 }).lean();
    return docs.map(toDto);
  },

  /** Resolves a page's own "latest insights" articles, keeping the order the page set. */
  async findBlogPostsByIds(ids: string[]) {
    const valid = ids.filter((i) => Types.ObjectId.isValid(i));
    if (!valid.length) return [];
    const docs = await BlogPostModel.find({ _id: trusted({ $in: valid }), ...PUBLIC }).lean();
    const byId = new Map(docs.map((d) => [String(d._id), toDto(d)]));
    return valid.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  },

  async findTestimonialsByIds(ids: string[]) {
    const valid = ids.filter((i) => Types.ObjectId.isValid(i));
    if (!valid.length) return [];
    const docs = await TestimonialModel.find({ _id: trusted({ $in: valid }), visible: true }).lean();
    const byId = new Map(docs.map((d) => [String(d._id), toDto(d)]));
    return valid.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  },

  async createTestimonial(data: Record<string, unknown>) {
    const doc = await TestimonialModel.create(data);
    return toDto(doc.toObject());
  },

  async updateTestimonial(id: string, data: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await TestimonialModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    return doc ? toDto(doc) : null;
  },

  async deleteTestimonial(id: string) {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await TestimonialModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },

  async listFaqs(opts: { includeHidden?: boolean; attachedTo?: string } = {}) {
    const filter: Record<string, unknown> = opts.includeHidden ? {} : { visible: true };
    if (opts.attachedTo) filter.attachedTo = opts.attachedTo;
    const docs = await FaqModel.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    return docs.map(toDto);
  },

  async createFaq(data: Record<string, unknown>) {
    const doc = await FaqModel.create(data);
    return toDto(doc.toObject());
  },

  async updateFaq(id: string, data: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await FaqModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    return doc ? toDto(doc) : null;
  },

  async deleteFaq(id: string) {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await FaqModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },

  /* ---------------------------------------------------------------- counts for dashboard */

  async contentCounts() {
    const [services, solutions, caseStudies, blogPosts, testimonials, faqs] = await Promise.all([
      ServicePageModel.countDocuments({ kind: 'service', ...PUBLIC }),
      ServicePageModel.countDocuments({ kind: 'solution', ...PUBLIC }),
      CaseStudyModel.countDocuments(PUBLIC),
      BlogPostModel.countDocuments(PUBLIC),
      TestimonialModel.countDocuments({ visible: true }),
      FaqModel.countDocuments({ visible: true }),
    ]);
    return { services, solutions, caseStudies, blogPosts, testimonials, faqs };
  },

  async draftCounts() {
    const [services, caseStudies, blogPosts, pages] = await Promise.all([
      ServicePageModel.countDocuments({ status: 'DRAFT' }),
      CaseStudyModel.countDocuments({ status: 'DRAFT' }),
      BlogPostModel.countDocuments({ status: 'DRAFT' }),
      SitePageModel.countDocuments({ status: 'DRAFT' }),
    ]);
    return { services, caseStudies, blogPosts, pages };
  },
};
