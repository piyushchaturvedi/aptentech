import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { ATTACHMENT_TOKEN_LENGTH, MAX_ATTACHMENTS } from '@aptentech/shared';
import { LeadAttachmentModel } from '../models';
import type { StoredAttachment } from '../services/attachment.service';

/** The receipt handed to the browser. Random, so it cannot be arrived at by counting. */
function mintToken(): string {
  return crypto.randomBytes(ATTACHMENT_TOKEN_LENGTH / 2).toString('hex');
}

export const attachmentRepository = {
  /** Records a stored file as uploaded-but-unclaimed, and returns its receipt. */
  async record(stored: StoredAttachment, ipHash: string | null) {
    const token = mintToken();
    await LeadAttachmentModel.create({ ...stored, token, ipHash, leadId: null });
    return { token, filename: stored.filename, mimeType: stored.mimeType, bytes: stored.bytes };
  },

  /**
   * Binds uploaded files to the lead that claimed them.
   *
   * Each token is spent with a single conditional update: `leadId: null` is part of the
   * filter, so the write only applies to a file nobody owns yet. Two enquiries racing for
   * the same token means one update matches and the other matches nothing — no lock, no
   * read-then-write window where both could see it free.
   *
   * Unknown, already-claimed and expired tokens all simply produce no match, and are
   * skipped. An enquiry is never rejected over an attachment: a file that failed to attach
   * is an inconvenience the sender can resolve by replying, while a refused enquiry is a
   * client who tried to reach us and did not.
   */
  async claim(tokens: string[], leadId: string) {
    const claimed: Array<{ attachmentId: Types.ObjectId; filename: string; mimeType: string; bytes: number }> = [];

    // The order the visitor chose them in is the order they are listed, so the admin sees
    // what the sender saw. Capped here as well as in the schema, since this is the last
    // point before the write.
    for (const token of tokens.slice(0, MAX_ATTACHMENTS)) {
      const doc = await LeadAttachmentModel.findOneAndUpdate(
        { token, leadId: null },
        { $set: { leadId: new Types.ObjectId(leadId), claimedAt: new Date() } },
        { new: true },
      ).lean();

      if (!doc) continue;

      claimed.push({
        attachmentId: doc._id,
        filename: doc.filename ?? '',
        mimeType: doc.mimeType ?? '',
        bytes: doc.bytes ?? 0,
      });
    }

    return claimed;
  },

  /**
   * One attachment, for the admin download.
   *
   * The lead id is part of the query rather than checked afterwards. An admin who follows a
   * link from one enquiry cannot read another's file by editing the attachment id in the
   * URL — the lookup simply finds nothing.
   */
  async findForLead(leadId: string, attachmentId: string) {
    if (!Types.ObjectId.isValid(leadId) || !Types.ObjectId.isValid(attachmentId)) return null;
    return LeadAttachmentModel.findOne({ _id: attachmentId, leadId }).lean();
  },

  /** Every attachment belonging to a lead — used when the lead itself is deleted. */
  async listForLead(leadId: string) {
    if (!Types.ObjectId.isValid(leadId)) return [];
    return LeadAttachmentModel.find({ leadId }).lean();
  },

  async deleteMany(ids: Types.ObjectId[]) {
    if (!ids.length) return;
    await LeadAttachmentModel.deleteMany({ _id: { $in: ids } });
  },

  /** Every storage key the database still knows about, for the orphan sweep. */
  async allStorageKeys(): Promise<Set<string>> {
    const docs = await LeadAttachmentModel.find({}).select('storageKey').lean();
    return new Set(docs.map((d) => d.storageKey));
  },
};
