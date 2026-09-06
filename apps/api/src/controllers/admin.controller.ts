import type { Request, Response, NextFunction } from 'express';
import { contentRepository } from '../repositories/content.repository';
import { leadRepository } from '../repositories/lead.repository';
import { adminRepository, auditRepository, mediaRepository, settingsRepository } from '../repositories/system.repository';
import { hydrateService } from '../services/hydrate.service';
import { sanitizeRichText, sanitizePageBlocks, sanitizeArticleHtml } from '../services/sanitize.service';
import { revalidateService, tags } from '../services/revalidate.service';
import { notFound, badRequest, conflict } from '../utils/errors';
import { ok, paginated } from '../utils/respond';
import { SERVICE_KINDS, type ServiceKind } from '@aptentech/shared';

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/** Records who changed what, then drops the caches that change affects. */
async function afterWrite(
  req: Request,
  action: string,
  entity: string,
  entityId: string | null,
  cacheTags: string[],
): Promise<void> {
  await auditRepository.record({
    adminId: req.session?.adminId,
    adminEmail: req.session?.email,
    action,
    entity,
    entityId,
    ip: req.ip ?? null,
  });
  await revalidateService.byTags(cacheTags);
}

export const adminController = {
  /* ------------------------------------------------------------------ dashboard */

  dashboard: asyncHandler(async (_req, res) => {
    const [leadStats, recentLeads, counts, drafts, mediaCount] = await Promise.all([
      leadRepository.stats(),
      leadRepository.recent(8),
      contentRepository.contentCounts(),
      contentRepository.draftCounts(),
      mediaRepository.count(),
    ]);

    return ok(res, {
      leads: leadStats,
      recentLeads,
      counts: { ...counts, media: mediaCount },
      drafts,
    });
  }),

  /* ------------------------------------------------------------------ service pages */

  listServicePages: asyncHandler(async (req, res) => {
    const kind = String(req.params.kind) as ServiceKind;
    if (!SERVICE_KINDS.includes(kind as ServiceKind)) throw badRequest('Unknown content type');
    const items = await contentRepository.listServicePages(kind, true);
    return ok(res, items);
  }),

  getServicePage: asyncHandler(async (req, res) => {
    const page = await contentRepository.findServicePageById(String(req.params.id));
    if (!page) throw notFound('Page not found');
    return ok(res, await hydrateService.media(page));
  }),

  createServicePage: asyncHandler(async (req, res) => {
    const created = await contentRepository.createServicePage(req.body as Record<string, unknown>);
    const kind = created.kind as ServiceKind;
    await afterWrite(req, 'CREATE', 'ServicePage', created.id, [
      kind === 'service' ? tags.services : tags.solutions,
      kind === 'service' ? tags.service(created.slug) : tags.solution(created.slug),
    ]);
    return ok(res, created, 201);
  }),

  updateServicePage: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const updated = await contentRepository.updateServicePage(id, req.body as Record<string, unknown>);
    if (!updated) throw notFound('Page not found');

    const kind = updated.kind as ServiceKind;
    await afterWrite(req, 'UPDATE', 'ServicePage', id, [
      kind === 'service' ? tags.services : tags.solutions,
      kind === 'service' ? tags.service(updated.slug) : tags.solution(updated.slug),
    ]);
    return ok(res, updated);
  }),

  deleteServicePage: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await contentRepository.findServicePageById(id);
    if (!existing) throw notFound('Page not found');

    await contentRepository.deleteServicePage(id);
    await afterWrite(req, 'DELETE', 'ServicePage', id, [tags.services, tags.solutions]);
    return ok(res, { deleted: true });
  }),

  /* ------------------------------------------------------------------ site pages */

  listPages: asyncHandler(async (_req, res) => ok(res, await contentRepository.listPages(true))),

  getPage: asyncHandler(async (req, res) => {
    const page = await contentRepository.findPageBySlug(String(req.params.slug), true);
    if (!page) throw notFound('Page not found');
    return ok(res, await hydrateService.media(page));
  }),

  updatePage: asyncHandler(async (req, res) => {
    const slug = String(req.params.slug);
    const updated = await contentRepository.updatePageBySlug(
      slug,
      sanitizePageBlocks(req.body as Record<string, unknown> & { blocks?: unknown }),
    );
    if (!updated) throw notFound('Page not found');
    await afterWrite(req, 'UPDATE', 'SitePage', updated.id, [tags.page(slug), tags.pages]);
    return ok(res, updated);
  }),


  /**
   * Slugs a custom page may not take.
   *
   * Two separate reasons, both of which produce a page that exists but never renders:
   * the seven core pages have their own routes and their own block shapes, and the listed
   * paths are real routes in the app. Next resolves a static segment before the catch-all,
   * so a page created at `services` would save cleanly and then be permanently unreachable —
   * the most confusing possible outcome for an editor.
   */
  RESERVED_SLUGS: new Set([
    'home', 'about', 'contact', 'case-studies', 'blog',
    'privacy-policy', 'terms-conditions', 'thank-you',
    'services', 'solutions', 'industries', 'technologies',
    // The listing routes read these by slug; deleting one leaves its route with no copy.
    'services-index', 'solutions-index', 'industries-index', 'technologies-index',
    'admin', 'api', 'uploads', 'sitemap', 'robots', '_next',
  ]),

  createPage: asyncHandler(async (req, res) => {
    const input = sanitizePageBlocks(req.body as Record<string, unknown> & { blocks?: unknown; slug?: string });
    const slug = String(input.slug ?? '').trim();

    if (adminController.RESERVED_SLUGS.has(slug)) {
      throw badRequest(`"${slug}" is reserved by an existing page or route. Choose another address.`);
    }

    const existing = await contentRepository.findPageBySlug(slug, true);
    if (existing) throw conflict(`A page already lives at /${slug}/`);

    const created = await contentRepository.createPage(input);
    await afterWrite(req, 'CREATE', 'SitePage', created.id, [tags.page(slug), tags.pages]);
    return ok(res, created, 201);
  }),

  deletePage: asyncHandler(async (req, res) => {
    const slug = String(req.params.slug);

    /*
      The core pages cannot be deleted.

      Each has a route that reads it by slug, so deleting one does not remove a page from the
      site — it leaves the route rendering nothing. Emptying its blocks is the supported way
      to clear a core page.
    */
    if (adminController.RESERVED_SLUGS.has(slug)) {
      throw badRequest(`"${slug}" is a built-in page and cannot be deleted. Clear its blocks instead.`);
    }

    const removed = await contentRepository.deletePageBySlug(slug);
    if (!removed) throw notFound('Page not found');

    await afterWrite(req, 'DELETE', 'SitePage', slug, [tags.page(slug), tags.pages]);
    return ok(res, { deleted: true });
  }),

  /* ------------------------------------------------------------------ case studies */

  listCaseStudies: asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number };
    const { items, total } = await contentRepository.listCaseStudies({
      includeDrafts: true,
      page: q.page,
      limit: q.pageSize,
    });
    return paginated(res, items, total, q.page, q.pageSize);
  }),

  createCaseStudy: asyncHandler(async (req, res) => {
    const created = await contentRepository.createCaseStudy(req.body as Record<string, unknown>);
    await afterWrite(req, 'CREATE', 'CaseStudy', created.id, [tags.caseStudies, tags.caseStudy(created.slug)]);
    return ok(res, created, 201);
  }),

  updateCaseStudy: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const updated = await contentRepository.updateCaseStudy(id, req.body as Record<string, unknown>);
    if (!updated) throw notFound('Case study not found');
    await afterWrite(req, 'UPDATE', 'CaseStudy', id, [tags.caseStudies, tags.caseStudy(updated.slug)]);
    return ok(res, updated);
  }),

  deleteCaseStudy: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const removed = await contentRepository.deleteCaseStudy(id);
    if (!removed) throw notFound('Case study not found');
    await afterWrite(req, 'DELETE', 'CaseStudy', id, [tags.caseStudies]);
    return ok(res, { deleted: true });
  }),

  /* ------------------------------------------------------------------ blog */

  listBlogPosts: asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      status?: string;
      category?: string;
    };

    // "ALL" is the list screen's own word for "no filter"; it is not a stored status.
    const status = q.status && q.status !== "ALL" ? q.status : undefined;

    const [{ items, total }, counts] = await Promise.all([
      contentRepository.listBlogPosts({
        includeDrafts: true,
        page: q.page,
        pageSize: q.pageSize,
        search: q.search,
        status,
        category: q.category,
      }),
      contentRepository.blogStatusCounts(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
        totalPages: q.pageSize > 0 ? Math.ceil(total / q.pageSize) : 0,
        counts,
      },
    });
  }),

  getBlogPost: asyncHandler(async (req, res) => {
    const post = await contentRepository.findBlogPostById(String(req.params.id));
    if (!post) throw notFound('Article not found');
    return ok(res, await hydrateService.media(post));
  }),

  createBlogPost: asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    // Sanitised before it is ever stored.
    body.body = sanitizeArticleHtml(String(body.body ?? ''));
    const created = await contentRepository.createBlogPost(body);
    await afterWrite(req, 'CREATE', 'BlogPost', created.id, [tags.blog, tags.post(created.slug)]);
    return ok(res, created, 201);
  }),

  updateBlogPost: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = req.body as Record<string, unknown>;
    body.body = sanitizeArticleHtml(String(body.body ?? ''));

    const updated = await contentRepository.updateBlogPost(id, body);
    if (!updated) throw notFound('Article not found');
    await afterWrite(req, 'UPDATE', 'BlogPost', id, [tags.blog, tags.post(updated.slug)]);
    return ok(res, updated);
  }),

  deleteBlogPost: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const removed = await contentRepository.deleteBlogPost(id);
    if (!removed) throw notFound('Article not found');
    await afterWrite(req, 'DELETE', 'BlogPost', id, [tags.blog]);
    return ok(res, { deleted: true });
  }),

  listBlogCategories: asyncHandler(async (_req, res) => ok(res, await contentRepository.listBlogCategories())),

  upsertBlogCategory: asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const category = await contentRepository.upsertBlogCategory(String(body.slug), body);
    await afterWrite(req, 'UPSERT', 'BlogCategory', category?.id ?? null, [tags.blog]);
    return ok(res, category);
  }),

  /* ------------------------------------------------------------------ testimonials & faqs */

  listTestimonials: asyncHandler(async (_req, res) => {
    const items = await contentRepository.listTestimonials({ includeHidden: true });
    return ok(res, await hydrateService.media(items));
  }),

  createTestimonial: asyncHandler(async (req, res) => {
    const created = await contentRepository.createTestimonial(req.body as Record<string, unknown>);
    await afterWrite(req, 'CREATE', 'Testimonial', created.id, [tags.testimonials]);
    return ok(res, created, 201);
  }),

  updateTestimonial: asyncHandler(async (req, res) => {
    const updated = await contentRepository.updateTestimonial(String(req.params.id), req.body as Record<string, unknown>);
    if (!updated) throw notFound('Testimonial not found');
    await afterWrite(req, 'UPDATE', 'Testimonial', updated.id, [tags.testimonials]);
    return ok(res, updated);
  }),

  deleteTestimonial: asyncHandler(async (req, res) => {
    const removed = await contentRepository.deleteTestimonial(String(req.params.id));
    if (!removed) throw notFound('Testimonial not found');
    await afterWrite(req, 'DELETE', 'Testimonial', String(req.params.id), [tags.testimonials]);
    return ok(res, { deleted: true });
  }),

  listFaqs: asyncHandler(async (_req, res) => ok(res, await contentRepository.listFaqs({ includeHidden: true }))),

  createFaq: asyncHandler(async (req, res) => {
    const created = await contentRepository.createFaq(req.body as Record<string, unknown>);
    await afterWrite(req, 'CREATE', 'Faq', created.id, [tags.faqs]);
    return ok(res, created, 201);
  }),

  updateFaq: asyncHandler(async (req, res) => {
    const updated = await contentRepository.updateFaq(String(req.params.id), req.body as Record<string, unknown>);
    if (!updated) throw notFound('FAQ not found');
    await afterWrite(req, 'UPDATE', 'Faq', updated.id, [tags.faqs]);
    return ok(res, updated);
  }),

  deleteFaq: asyncHandler(async (req, res) => {
    const removed = await contentRepository.deleteFaq(String(req.params.id));
    if (!removed) throw notFound('FAQ not found');
    await afterWrite(req, 'DELETE', 'Faq', String(req.params.id), [tags.faqs]);
    return ok(res, { deleted: true });
  }),

  /* ------------------------------------------------------------------ settings */

  getSettings: asyncHandler(async (_req, res) => {
    const settings = await settingsRepository.get();
    return ok(res, await hydrateService.media(settings));
  }),

  updateSettings: asyncHandler(async (req, res) => {
    const updated = await settingsRepository.update(req.body as Record<string, unknown>);
    // Header, footer and navigation appear on every page, so this invalidates broadly.
    await afterWrite(req, 'UPDATE', 'SiteSettings', updated?.id ?? null, [
      tags.settings,
      tags.navigation,
      tags.services,
      tags.solutions,
      tags.blog,
      tags.caseStudies,
    ]);
    return ok(res, updated);
  }),

  /* ------------------------------------------------------------------ audit & users */

  listAuditLog: asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number };
    const { items, total } = await auditRepository.list(q);
    return paginated(res, items, total, q.page, q.pageSize);
  }),

  listAdminUsers: asyncHandler(async (_req, res) => ok(res, await adminRepository.list())),
};
