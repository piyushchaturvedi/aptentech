import type { Request, Response, NextFunction } from 'express';
import { contentRepository } from '../repositories/content.repository';
import { settingsRepository, redirectRepository } from '../repositories/system.repository';
import { hydrateService } from '../services/hydrate.service';
import { sanitizeRichText, sanitizePageBlocks, sanitizeArticleHtml } from '../services/sanitize.service';
import { notFound } from '../utils/errors';
import { ok, paginated } from '../utils/respond';
import type { ServiceKind } from '@aptentech/shared';

/**
 * Public read endpoints.
 *
 * These are called only by the Next.js server, which caches the results — a visitor's page
 * view does not reach this controller, let alone MongoDB. Every handler returns fully
 * hydrated, render-ready data so the web app never has to make a follow-up call.
 */

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/** Loads a service/solution page plus the case studies and testimonials it references. */
async function loadServicePage(kind: ServiceKind, slug: string) {
  const page = await contentRepository.findServicePageBySlug(kind, slug);
  if (!page) return null;

  const [caseStudies, testimonials, latest] = await Promise.all([
    contentRepository.findCaseStudiesByIds((page.caseStudyIds ?? []).map(String)),
    contentRepository.findTestimonialsByIds((page.testimonialIds ?? []).map(String)),
    // The "latest insights" strip. Each page links three articles of its own; a page that
    // names none falls back to the most recent published ones.
    (page.latestPostIds ?? []).length
      ? contentRepository
          .findBlogPostsByIds((page.latestPostIds ?? []).map(String))
          .then((items) => ({ items, total: items.length }))
      : contentRepository.listBlogPosts({ page: 1, pageSize: 3 }),
  ]);

  return hydrateService.media({ ...page, caseStudies, testimonials, latestPosts: latest.items });
}

export const publicController = {
  settings: asyncHandler(async (_req, res) => {
    const settings = await settingsRepository.get();
    return ok(res, await hydrateService.media(settings));
  }),

  listServices: asyncHandler(async (_req, res) => {
    const items = await contentRepository.listServicePages('service');
    return ok(res, await hydrateService.media(items));
  }),

  listSolutions: asyncHandler(async (_req, res) => {
    const items = await contentRepository.listServicePages('solution');
    return ok(res, await hydrateService.media(items));
  }),

  getService: asyncHandler(async (req, res) => {
    const data = await loadServicePage('service', String(req.params.slug));
    if (!data) throw notFound('Service not found');
    return ok(res, data);
  }),

  listIndustries: asyncHandler(async (_req, res) => {
    const items = await contentRepository.listServicePages('industry');
    return ok(res, await hydrateService.media(items));
  }),

  getIndustry: asyncHandler(async (req, res) => {
    const data = await loadServicePage('industry', String(req.params.slug));
    if (!data) throw notFound('Industry not found');
    return ok(res, data);
  }),

  listTechnologies: asyncHandler(async (_req, res) => {
    const items = await contentRepository.listServicePages('technology');
    return ok(res, await hydrateService.media(items));
  }),

  getTechnology: asyncHandler(async (req, res) => {
    const data = await loadServicePage('technology', String(req.params.slug));
    if (!data) throw notFound('Technology not found');
    return ok(res, data);
  }),

  getSolution: asyncHandler(async (req, res) => {
    const data = await loadServicePage('solution', String(req.params.slug));
    if (!data) throw notFound('Solution not found');
    return ok(res, data);
  }),

  getPage: asyncHandler(async (req, res) => {
    const stored = await contentRepository.findPageBySlug(String(req.params.slug));
    if (!stored) throw notFound('Page not found');

    // Sanitised again on read: stored content is not assumed safe just because it was
    // sanitised on write.
    const page = sanitizePageBlocks(stored);

    // Pull the shared collections a page block may need, so the web app renders in one pass.
    // A page that names its own case studies gets those; otherwise the published index.
    const ownCases = (page.caseStudyIds ?? []).map(String);
    const [caseStudies, testimonials, blogPosts] = await Promise.all([
      ownCases.length
        ? contentRepository.findCaseStudiesByIds(ownCases).then((items) => ({ items, total: items.length }))
        : contentRepository.listCaseStudies({ limit: 12 }),
      (page.testimonialIds ?? []).length
        ? contentRepository.findTestimonialsByIds((page.testimonialIds ?? []).map(String))
        : contentRepository.listTestimonials({}),
      (page.latestPostIds ?? []).length
        ? contentRepository.findBlogPostsByIds((page.latestPostIds ?? []).map(String))
        : contentRepository.listBlogPosts({ page: 1, pageSize: 3 }).then((r) => r.items),
    ]);

    return ok(
      res,
      await hydrateService.media({
        ...page,
        caseStudies: caseStudies.items,
        testimonials,
        latestPosts: blogPosts,
      }),
    );
  }),

  listCaseStudies: asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number; category?: string };
    const { items, total } = await contentRepository.listCaseStudies({
      page: q.page,
      limit: q.pageSize,
      category: q.category,
    });
    return paginated(res, await hydrateService.media(items), total, q.page, q.pageSize);
  }),

  getCaseStudy: asyncHandler(async (req, res) => {
    const item = await contentRepository.findCaseStudyBySlug(String(req.params.slug));
    if (!item) throw notFound('Case study not found');
    return ok(res, await hydrateService.media(item));
  }),

  listBlog: asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number; category?: string; tag?: string };
    const { items, total } = await contentRepository.listBlogPosts({
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
      tag: q.tag,
    });
    return paginated(res, await hydrateService.media(items), total, q.page, q.pageSize);
  }),

  getBlogPost: asyncHandler(async (req, res) => {
    const post = await contentRepository.findBlogPostBySlug(String(req.params.slug));
    if (!post) throw notFound('Article not found');

    // Sanitised again on read: stored content is not assumed safe just because it was
    // sanitised on write.
    const safe = { ...post, body: sanitizeArticleHtml(post.body ?? '') };

    const related = await contentRepository.listBlogPosts({ page: 1, pageSize: 4 });
    return ok(
      res,
      await hydrateService.media({
        ...safe,
        related: related.items.filter((p) => p.slug !== post.slug).slice(0, 3),
      }),
    );
  }),

  listBlogCategories: asyncHandler(async (_req, res) => {
    return ok(res, await contentRepository.listBlogCategories());
  }),

  listTestimonials: asyncHandler(async (req, res) => {
    const attachedTo = typeof req.query.attachedTo === 'string' ? req.query.attachedTo : undefined;
    const items = await contentRepository.listTestimonials({ attachedTo });
    return ok(res, await hydrateService.media(items));
  }),

  listFaqs: asyncHandler(async (req, res) => {
    const attachedTo = typeof req.query.attachedTo === 'string' ? req.query.attachedTo : undefined;
    return ok(res, await contentRepository.listFaqs({ attachedTo }));
  }),

  /** Everything the web app needs to build sitemap.xml in one call. */
  sitemap: asyncHandler(async (_req, res) => {
    const [services, posts, caseStudies, pages] = await Promise.all([
      contentRepository.listAllServiceSlugs(),
      contentRepository.listBlogSlugs(),
      contentRepository.listCaseStudies({ limit: 500 }),
      contentRepository.listPages(),
    ]);

    return ok(res, {
      services: services.filter((s) => s.kind === 'service'),
      solutions: services.filter((s) => s.kind === 'solution'),
      industries: services.filter((s) => s.kind === 'industry'),
      technologies: services.filter((s) => s.kind === 'technology'),
      posts,
      caseStudies: caseStudies.items.map((c) => ({ slug: c.slug, updatedAt: c.updatedAt, detailHref: c.detailHref })),
      pages: pages.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
    });
  }),

  redirects: asyncHandler(async (_req, res) => {
    return ok(res, await redirectRepository.listActive());
  }),
};
