import type { Request, Response, NextFunction } from 'express';
import { attachmentRepository } from '../repositories/attachment.repository';
import { attachmentService } from '../services/attachment.service';
import { badRequest, notFound } from '../utils/errors';
import { ok } from '../utils/respond';
import { hashValue } from '../services/lead.service';
import { logger } from '../utils/logger';

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

export const attachmentController = {
  /**
   * Public upload, one file per request.
   *
   * One at a time rather than a batch, because that is what makes the form able to say
   * "uploaded" beside each file as it lands. A batch would have to either report nothing
   * until the slowest finished, or fail as a unit and lose files that were fine.
   *
   * Nothing here connects the file to a person yet. It is stored, given a receipt, and
   * forgotten about until an enquiry presents that receipt — or until the day passes and
   * the record expires because no enquiry ever did.
   */
  upload: asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('No file was uploaded.');

    // Throws on anything that is not a supported type, empty, or over the size cap.
    const stored = await attachmentService.store({
      buffer: file.buffer,
      originalname: file.originalname,
    });

    // The address is kept as a salted hash only — enough to trace a flood back to one
    // source, not a record of who sent what.
    const receipt = await attachmentRepository.record(stored, req.ip ? hashValue(req.ip) : null);

    return ok(res, receipt, 201);
  }),

  /**
   * Admin download.
   *
   * Sent as an attachment with a fixed `application/octet-stream` type, never inline and
   * never with the stored type. A PDF or an SVG opened inline is a document the browser
   * executes in our own origin, and this content came from an anonymous uploader — so the
   * browser is told to save it rather than to interpret it, whatever it turns out to be.
   */
  download: asyncHandler(async (req, res) => {
    const record = await attachmentRepository.findForLead(String(req.params.id), String(req.params.attachmentId));
    if (!record) throw notFound('Attachment not found');

    let bytes: Buffer;
    try {
      bytes = await attachmentService.read(record.storageKey);
    } catch (error) {
      /*
        The record exists and the file does not.

        Worth its own log line rather than a generic 500: it means the database and the disk
        have diverged, which happens if the volume was replaced or restored from a backup
        taken at a different moment, and it will not fix itself.
      */
      logger.error(
        { storageKey: record.storageKey, leadId: String(req.params.id), err: error },
        'Enquiry attachment is recorded but missing from disk',
      );
      throw notFound('That file is no longer available');
    }

    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-length', String(bytes.length));
    // A quoted, escaped filename — the stored name is the visitor's and may contain a quote.
    res.setHeader(
      'content-disposition',
      `attachment; filename="${(record.filename || 'attachment').replace(/"/g, '')}"`,
    );
    // Someone else's confidential document must not sit in a shared cache.
    res.setHeader('cache-control', 'private, no-store');

    return res.send(bytes);
  }),
};
