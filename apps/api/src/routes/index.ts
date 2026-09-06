import { Router } from 'express';
import multer from 'multer';
import {
  adminLoginSchema,
  adminReplySchema,
  adminPasswordChangeSchema,
  blogListQuerySchema,
  blogPostSchema,
  blogCategorySchema,
  caseStudySchema,
  emailTemplateSchema,
  faqItemSchema,
  inboundEmailSchema,
  idParamSchema,
  leadListQuerySchema,
  leadNoteSchema,
  leadStatusUpdateSchema,
  leadSubmissionRefined,
  mediaUpdateSchema,
  paginationSchema,
  publicListQuerySchema,
  servicePageSchema,
  sitePageSchema,
  siteSettingsSchema,
  templatePreviewSchema,
  testimonialSchema,
  unmatchedResolveSchema,
} from '@aptentech/shared';

import { publicController } from '../controllers/public.controller';
import { leadController } from '../controllers/lead.controller';
import { authController } from '../controllers/auth.controller';
import { adminController } from '../controllers/admin.controller';
import { mediaController } from '../controllers/media.controller';
import { emailController } from '../controllers/email.controller';

import { validate } from '../middleware/validate';
import {
  blockIfPasswordChangeRequired,
  requireAdmin,
  requireCsrf,
  requireRole,
  requireServiceToken,
} from '../middleware/auth';
import { inboundLimiter, leadLimiter, loginLimiter, replyLimiter, uploadLimiter } from '../middleware/rateLimit';
import { env } from '../config/env';

export const api = Router();

/* ================================================================== public reads */

/**
 * Called by the Next.js server only, never by a browser. The service token keeps the CMS
 * read API off the public internet even though its content is ultimately public.
 */
const pub = Router();
pub.use(requireServiceToken);

pub.get('/site-settings', publicController.settings);
pub.get('/services', publicController.listServices);
pub.get('/services/:slug', publicController.getService);
pub.get('/solutions', publicController.listSolutions);
pub.get('/solutions/:slug', publicController.getSolution);
pub.get('/industries', publicController.listIndustries);
pub.get('/industries/:slug', publicController.getIndustry);
pub.get('/technologies', publicController.listTechnologies);
pub.get('/technologies/:slug', publicController.getTechnology);
pub.get('/pages', publicController.listPages);
pub.get('/pages/:slug', publicController.getPage);
pub.get('/case-studies', validate(publicListQuerySchema, 'query'), publicController.listCaseStudies);
pub.get('/case-studies/:slug', publicController.getCaseStudy);
pub.get('/blog', validate(publicListQuerySchema, 'query'), publicController.listBlog);
pub.get('/blog/categories', publicController.listBlogCategories);
pub.get('/blog/:slug', publicController.getBlogPost);
pub.get('/testimonials', publicController.listTestimonials);
pub.get('/faqs', publicController.listFaqs);
pub.get('/sitemap', publicController.sitemap);
pub.get('/redirects', publicController.redirects);

api.use('/', pub);

/* ================================================================== lead intake */

/**
 * The only public write path on the API. Rate-limited before validation so a flood costs
 * as little work as possible.
 */
api.post(
  '/leads',
  requireServiceToken,
  leadLimiter,
  validate(leadSubmissionRefined),
  leadController.submit,
);

/* ================================================================== inbound mail */

/**
 * Where the mail provider posts a client's reply.
 *
 * Outside the admin router on purpose: the caller is a machine with no session and no CSRF
 * token. Its own shared secret is checked inside the handler, and the endpoint is
 * rate-limited because it is reachable without authentication.
 */
api.post('/email/inbound', inboundLimiter, validate(inboundEmailSchema), emailController.inbound);

/* ================================================================== admin auth */

const auth = Router();
auth.post('/login', loginLimiter, validate(adminLoginSchema), authController.login);
auth.post('/logout', requireAdmin, authController.logout);
auth.get('/me', requireAdmin, authController.me);
auth.post(
  '/change-password',
  requireAdmin,
  requireCsrf,
  validate(adminPasswordChangeSchema),
  authController.changePassword,
);
api.use('/admin/auth', auth);

/* ================================================================== admin (protected) */

const admin = Router();

// Every admin route below is authenticated, CSRF-checked on writes, and blocked while a
// forced password change is outstanding. This is enforced here rather than relying on
// Next.js middleware, which only handles redirects for the user's benefit.
admin.use(requireAdmin);
admin.use(requireCsrf);
admin.use(blockIfPasswordChangeRequired);

admin.get('/dashboard', adminController.dashboard);

// Leads
admin.get('/leads', validate(leadListQuerySchema, 'query'), leadController.list);
admin.get('/leads/export', validate(leadListQuerySchema, 'query'), leadController.exportCsv);
admin.get('/leads/stats', leadController.stats);
admin.get('/leads/:id', validate(idParamSchema, 'params'), leadController.detail);
admin.patch(
  '/leads/:id/status',
  validate(idParamSchema, 'params'),
  validate(leadStatusUpdateSchema),
  leadController.updateStatus,
);
admin.post('/leads/:id/notes', validate(idParamSchema, 'params'), validate(leadNoteSchema), leadController.addNote);

// Lead conversation — the thread, the reply, and retrying a delivery that failed.
admin.get('/leads/:id/conversation', validate(idParamSchema, 'params'), emailController.conversation);
admin.post(
  '/leads/:id/reply',
  replyLimiter,
  validate(idParamSchema, 'params'),
  validate(adminReplySchema),
  emailController.reply,
);
admin.post('/leads/:id/messages/:messageId/retry', validate(idParamSchema, 'params'), emailController.retryMessage);

// Email templates
admin.get('/email-templates', emailController.listTemplates);
admin.post('/email-templates/preview', validate(templatePreviewSchema), emailController.previewTemplate);
admin.get('/email-templates/:id', validate(idParamSchema, 'params'), emailController.getTemplate);
admin.post('/email-templates', validate(emailTemplateSchema), emailController.createTemplate);
admin.put(
  '/email-templates/:id',
  validate(idParamSchema, 'params'),
  validate(emailTemplateSchema),
  emailController.updateTemplate,
);
admin.delete(
  '/email-templates/:id',
  requireRole('ADMIN'),
  validate(idParamSchema, 'params'),
  emailController.deleteTemplate,
);

// Inbound replies that could not be matched to a thread.
admin.get('/inbound/unmatched', emailController.listUnmatched);
admin.post(
  '/inbound/unmatched/:id/attach',
  validate(idParamSchema, 'params'),
  validate(unmatchedResolveSchema),
  emailController.attachUnmatched,
);
admin.post('/inbound/unmatched/:id/discard', validate(idParamSchema, 'params'), emailController.discardUnmatched);

// Service and solution pages
admin.get('/content/:kind', adminController.listServicePages);
admin.get('/service-pages/:id', validate(idParamSchema, 'params'), adminController.getServicePage);
admin.post('/service-pages', validate(servicePageSchema), adminController.createServicePage);
admin.put(
  '/service-pages/:id',
  validate(idParamSchema, 'params'),
  validate(servicePageSchema),
  adminController.updateServicePage,
);
admin.delete(
  '/service-pages/:id',
  requireRole('ADMIN'),
  validate(idParamSchema, 'params'),
  adminController.deleteServicePage,
);

// Static pages
admin.get('/pages', adminController.listPages);
admin.get('/pages/:slug', adminController.getPage);
admin.post('/pages', validate(sitePageSchema), adminController.createPage);
admin.put('/pages/:slug', validate(sitePageSchema), adminController.updatePage);
admin.delete('/pages/:slug', requireRole('ADMIN'), adminController.deletePage);

// Case studies
admin.get('/case-studies', validate(paginationSchema, 'query'), adminController.listCaseStudies);
admin.post('/case-studies', validate(caseStudySchema), adminController.createCaseStudy);
admin.put(
  '/case-studies/:id',
  validate(idParamSchema, 'params'),
  validate(caseStudySchema),
  adminController.updateCaseStudy,
);
admin.delete(
  '/case-studies/:id',
  requireRole('ADMIN'),
  validate(idParamSchema, 'params'),
  adminController.deleteCaseStudy,
);

// Blog
admin.get('/blog', validate(blogListQuerySchema, 'query'), adminController.listBlogPosts);
admin.get('/blog/categories', adminController.listBlogCategories);
admin.post('/blog/categories', validate(blogCategorySchema), adminController.upsertBlogCategory);
admin.get('/blog/:id', validate(idParamSchema, 'params'), adminController.getBlogPost);
admin.post('/blog', validate(blogPostSchema), adminController.createBlogPost);
admin.put('/blog/:id', validate(idParamSchema, 'params'), validate(blogPostSchema), adminController.updateBlogPost);
admin.delete('/blog/:id', requireRole('ADMIN'), validate(idParamSchema, 'params'), adminController.deleteBlogPost);

// Testimonials
admin.get('/testimonials', adminController.listTestimonials);
admin.post('/testimonials', validate(testimonialSchema), adminController.createTestimonial);
admin.put(
  '/testimonials/:id',
  validate(idParamSchema, 'params'),
  validate(testimonialSchema),
  adminController.updateTestimonial,
);
admin.delete('/testimonials/:id', validate(idParamSchema, 'params'), adminController.deleteTestimonial);

// FAQs
admin.get('/faqs', adminController.listFaqs);
admin.post('/faqs', validate(faqItemSchema), adminController.createFaq);
admin.put('/faqs/:id', validate(idParamSchema, 'params'), validate(faqItemSchema), adminController.updateFaq);
admin.delete('/faqs/:id', validate(idParamSchema, 'params'), adminController.deleteFaq);

// Settings — sitewide, so restricted above editor level.
admin.get('/settings', adminController.getSettings);
admin.put('/settings', requireRole('ADMIN'), validate(siteSettingsSchema), adminController.updateSettings);

// Media
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 8 },
});
admin.get('/media', validate(paginationSchema, 'query'), mediaController.list);
admin.post('/media', uploadLimiter, upload.single('file'), mediaController.upload);
admin.patch('/media/:id', validate(idParamSchema, 'params'), validate(mediaUpdateSchema), mediaController.updateAlt);
admin.delete('/media/:id', requireRole('ADMIN'), validate(idParamSchema, 'params'), mediaController.remove);

// Audit trail and users — administrative visibility only.
admin.get('/audit-log', requireRole('ADMIN'), validate(paginationSchema, 'query'), adminController.listAuditLog);
admin.get('/users', requireRole('ADMIN'), adminController.listAdminUsers);

api.use('/admin', admin);
