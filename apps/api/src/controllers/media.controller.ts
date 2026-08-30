import type { Request, Response, NextFunction } from 'express';
import { mediaRepository, auditRepository } from '../repositories/system.repository';
import { mediaService } from '../services/media.service';
import { badRequest, notFound } from '../utils/errors';
import { ok, paginated } from '../utils/respond';
import { logger } from '../utils/logger';

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

export const mediaController = {
  list: asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number; search?: string };
    const { items, total } = await mediaRepository.list(q);
    const withUrls = items.map((m) => ({ ...m, url: mediaService.publicUrl(m.key) }));
    return paginated(res, withUrls, total, q.page, q.pageSize);
  }),

  /**
   * Upload.
   *
   * The file arrives in memory (capped by multer at the configured limit), is validated by
   * its actual bytes rather than its declared type, and only then written to storage. The
   * database record is created after the write succeeds, so a failed upload never leaves
   * an entry pointing at a file that does not exist.
   */
  upload: asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('No file was uploaded');

    const stored = await mediaService.store({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
    });

    const record = await mediaRepository.create({
      key: stored.key,
      filename: file.originalname.slice(0, 255),
      mimeType: stored.mimeType,
      bytes: stored.bytes,
      width: stored.width,
      height: stored.height,
      alt: typeof req.body?.alt === 'string' ? req.body.alt.slice(0, 300) : '',
      uploadedBy: req.session?.adminId ?? null,
    });

    await auditRepository.record({
      adminId: req.session?.adminId,
      adminEmail: req.session?.email,
      action: 'MEDIA_UPLOAD',
      entity: 'Media',
      entityId: record.id,
      ip: req.ip ?? null,
    });

    logger.info({ mediaId: record.id, bytes: stored.bytes, type: stored.mimeType }, 'Media uploaded');
    return ok(res, { ...record, url: stored.url }, 201);
  }),

  updateAlt: asyncHandler(async (req, res) => {
    const updated = await mediaRepository.update(String(req.params.id), { alt: (req.body as { alt: string }).alt });
    if (!updated) throw notFound('Media not found');
    return ok(res, { ...updated, url: mediaService.publicUrl(updated.key) });
  }),

  /**
   * Delete.
   *
   * The database record goes first: if removing the stored object then fails, the CMS is
   * consistent and the leftover is an orphaned file rather than a broken reference on the
   * live site. The reverse order would show visitors a missing image.
   */
  remove: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const removed = await mediaRepository.remove(id);
    if (!removed) throw notFound('Media not found');

    try {
      await mediaService.remove(removed.key);
    } catch (err) {
      logger.warn({ err, key: removed.key }, 'Media record deleted but the stored file could not be removed');
    }

    await auditRepository.record({
      adminId: req.session?.adminId,
      adminEmail: req.session?.email,
      action: 'MEDIA_DELETE',
      entity: 'Media',
      entityId: id,
      ip: req.ip ?? null,
    });

    return ok(res, { deleted: true });
  }),
};
