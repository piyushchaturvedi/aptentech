import { Types, trusted } from 'mongoose';
import { LeadModel } from '../models';
import { toDto } from './content.repository';
import type { LeadStatus } from '@aptentech/shared';
import { LEAD_STATUSES } from '@aptentech/shared';

export interface LeadListOptions {
  page: number;
  pageSize: number;
  status: LeadStatus | 'ALL';
  search?: string;
  sourceForm?: string;
  from?: string;
  to?: string;
  sort: 'createdAt' | '-createdAt' | 'name' | '-name';
}

/** Escapes a user string so it cannot act as a regular expression. */
function literalRegex(input: string): RegExp {
  const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

/**
 * A lead as the API contract describes it.
 *
 * `toDto` normalises the document's own `_id` to `id` and stops there — it does not walk
 * into sub-documents, and should not. Attachments are stored with an `attachmentId` naming
 * the record they point at, while the published type calls that field `id`, so the rename
 * happens here.
 *
 * Every read in this file goes through this rather than through `toDto` directly. One
 * wrapper is what keeps the two shapes in step: a read added later gets the mapping by
 * default, instead of returning attachments whose id is silently `undefined`.
 */
function leadDto<T extends { _id: unknown }>(doc: T) {
  const dto = toDto(doc) as Omit<T, '_id'> & {
    id: string;
    attachments?: Array<{ attachmentId?: unknown; id?: string; filename?: string; mimeType?: string; bytes?: number }>;
  };

  if (Array.isArray(dto.attachments)) {
    dto.attachments = dto.attachments.map(({ attachmentId, ...rest }) => ({ ...rest, id: String(attachmentId ?? '') }));
  }

  return dto;
}

export const leadRepository = {
  async create(data: Record<string, unknown>) {
    const doc = await LeadModel.create(data);
    return leadDto(doc.toObject());
  },

  /**
   * Copies the claimed attachments onto the lead.
   *
   * A second write rather than part of `create`, because a file is only claimable once the
   * lead it is being claimed for has an id. The denormalised copy is what the admin list and
   * the notification email read, so neither has to touch the attachment collection.
   */
  async setAttachments(
    leadId: string,
    attachments: Array<{ attachmentId: Types.ObjectId; filename: string; mimeType: string; bytes: number }>,
  ) {
    await LeadModel.updateOne({ _id: leadId }, { $set: { attachments } });
  },

  /**
   * Duplicate guard. Collapses an identical enquiry resubmitted within the window — the
   * usual cause is an impatient double-click, and it is also the cheapest way to blunt a
   * naive flood without penalising a genuine second enquiry days later.
   */
  async findRecentDuplicate(fingerprint: string, withinMs: number) {
    const since = new Date(Date.now() - withinMs);
    return LeadModel.findOne({ fingerprint, createdAt: trusted({ $gte: since }) })
      .select('_id createdAt')
      .lean();
  },

  async list(opts: LeadListOptions) {
    const filter: Record<string, unknown> = {};

    if (opts.status !== 'ALL') filter.status = opts.status;
    if (opts.sourceForm) filter.sourceForm = opts.sourceForm;

    if (opts.search) {
      const rx = literalRegex(opts.search);
      filter.$or = trusted([{ name: rx }, { email: rx }, { company: rx }, { message: rx }, { service: rx }]);
    }

    if (opts.from || opts.to) {
      const range: Record<string, Date> = {};
      if (opts.from) {
        const d = new Date(opts.from);
        if (!Number.isNaN(d.getTime())) range.$gte = d;
      }
      if (opts.to) {
        const d = new Date(opts.to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          range.$lte = d;
        }
      }
      if (Object.keys(range).length) filter.createdAt = trusted(range);
    }

    const sortSpec: Record<string, 1 | -1> = opts.sort.startsWith('-')
      ? { [opts.sort.slice(1)]: -1 }
      : { [opts.sort]: 1 };

    const [items, total] = await Promise.all([
      LeadModel.find(filter)
        .sort(sortSpec)
        .skip((opts.page - 1) * opts.pageSize)
        .limit(opts.pageSize)
        .lean(),
      LeadModel.countDocuments(filter),
    ]);

    return { items: items.map(leadDto), total };
  },

  /** Unpaginated, for CSV export. Capped so an export cannot exhaust memory. */
  async listForExport(opts: Omit<LeadListOptions, 'page' | 'pageSize'>, cap = 5000) {
    const { items } = await this.list({ ...opts, page: 1, pageSize: cap });
    return items;
  },

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LeadModel.findById(id).lean();
    return doc ? leadDto(doc) : null;
  },

  async updateStatus(id: string, status: LeadStatus) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LeadModel.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    return doc ? leadDto(doc) : null;
  },

  async addNote(id: string, note: { body: string; authorId: string; authorName: string }) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LeadModel.findByIdAndUpdate(
      id,
      { $push: { notes: { ...note, createdAt: new Date() } } },
      { new: true },
    ).lean();
    return doc ? leadDto(doc) : null;
  },

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await LeadModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },

  /**
   * Dashboard statistics in two round trips rather than nine separate counts.
   */
  async stats() {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const [byStatusRaw, windows] = await Promise.all([
      LeadModel.aggregate<{ _id: LeadStatus; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      LeadModel.aggregate<{ last7: number; last30: number; total: number }>([
        {
          $facet: {
            last7: [{ $match: { createdAt: { $gte: new Date(now - 7 * day) } } }, { $count: 'n' }],
            last30: [{ $match: { createdAt: { $gte: new Date(now - 30 * day) } } }, { $count: 'n' }],
            total: [{ $count: 'n' }],
          },
        },
        {
          $project: {
            last7: { $ifNull: [{ $arrayElemAt: ['$last7.n', 0] }, 0] },
            last30: { $ifNull: [{ $arrayElemAt: ['$last30.n', 0] }, 0] },
            total: { $ifNull: [{ $arrayElemAt: ['$total.n', 0] }, 0] },
          },
        },
      ]),
    ]);

    const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
    for (const row of byStatusRaw) {
      if (row._id in byStatus) byStatus[row._id] = row.count;
    }

    const w = windows[0] ?? { last7: 0, last30: 0, total: 0 };
    return { total: w.total, byStatus, last7Days: w.last7, last30Days: w.last30 };
  },

  async recent(limit = 8) {
    const docs = await LeadModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map(leadDto);
  },
};
