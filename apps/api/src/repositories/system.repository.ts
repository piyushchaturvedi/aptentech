import { Types, trusted } from 'mongoose';
import { AdminUserModel, AuditLogModel, MediaModel, RedirectModel, SiteSettingsModel } from '../models';
import { toDto } from './content.repository';

export const settingsRepository = {
  /**
   * Site settings are a singleton. `upsert` on a fixed key means the first read after a
   * fresh install creates the document rather than returning null and forcing every caller
   * to handle an empty state.
   */
  async get() {
    const doc = await SiteSettingsModel.findOneAndUpdate(
      { singleton: 'site' },
      { $setOnInsert: { singleton: 'site' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return doc ? toDto(doc) : null;
  },

  async update(data: Record<string, unknown>) {
    const doc = await SiteSettingsModel.findOneAndUpdate(
      { singleton: 'site' },
      { $set: data },
      { new: true, upsert: true, runValidators: true },
    ).lean();
    return doc ? toDto(doc) : null;
  },
};

export const mediaRepository = {
  async create(data: Record<string, unknown>) {
    const doc = await MediaModel.create(data);
    return toDto(doc.toObject());
  },

  async list(opts: { page: number; pageSize: number; search?: string }) {
    const filter: Record<string, unknown> = {};
    if (opts.search) {
      const escaped = opts.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = trusted([{ filename: rx }, { alt: rx }]);
    }
    const [items, total] = await Promise.all([
      MediaModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((opts.page - 1) * opts.pageSize)
        .limit(opts.pageSize)
        .lean(),
      MediaModel.countDocuments(filter),
    ]);
    return { items: items.map(toDto), total };
  },

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await MediaModel.findById(id).lean();
    return doc ? toDto(doc) : null;
  },

  async findByIds(ids: string[]) {
    const valid = ids.filter((i) => Types.ObjectId.isValid(i));
    if (!valid.length) return [];
    const docs = await MediaModel.find({ _id: trusted({ $in: valid }) }).lean();
    return docs.map(toDto);
  },

  async update(id: string, data: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await MediaModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    return doc ? toDto(doc) : null;
  },

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await MediaModel.findByIdAndDelete(id).lean();
    return doc ? toDto(doc) : null;
  },

  async count() {
    return MediaModel.countDocuments();
  },
};

export const adminRepository = {
  /** Includes the password hash and lockout fields, which are `select: false` by default. */
  async findByEmailWithSecrets(email: string) {
    return AdminUserModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash +failedAttempts +lockedUntil')
      .lean();
  },

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await AdminUserModel.findById(id).lean();
    return doc ? toDto(doc) : null;
  },

  async findByIdWithSecrets(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return AdminUserModel.findById(id).select('+passwordHash').lean();
  },

  async list() {
    const docs = await AdminUserModel.find().sort({ createdAt: 1 }).lean();
    return docs.map(toDto);
  },

  async create(data: Record<string, unknown>) {
    const doc = await AdminUserModel.create(data);
    const obj = doc.toObject();
    delete (obj as Record<string, unknown>).passwordHash;
    return toDto(obj);
  },

  async update(id: string, data: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await AdminUserModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
    return doc ? toDto(doc) : null;
  },

  async registerFailedAttempt(id: string, lockAfter: number, lockMs: number) {
    const doc = await AdminUserModel.findByIdAndUpdate(id, { $inc: { failedAttempts: 1 } }, { new: true })
      .select('+failedAttempts')
      .lean();
    if (doc && (doc.failedAttempts ?? 0) >= lockAfter) {
      await AdminUserModel.updateOne(
        { _id: id },
        { $set: { lockedUntil: new Date(Date.now() + lockMs), failedAttempts: 0 } },
      );
    }
  },

  async clearFailedAttempts(id: string) {
    await AdminUserModel.updateOne({ _id: id }, { $set: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  },

  async count() {
    return AdminUserModel.countDocuments();
  },
};

export const auditRepository = {
  async record(entry: {
    adminId?: string | null;
    adminEmail?: string;
    action: string;
    entity: string;
    entityId?: string | null;
    result?: 'SUCCESS' | 'FAILURE';
    ip?: string | null;
  }) {
    await AuditLogModel.create({
      adminId: entry.adminId && Types.ObjectId.isValid(entry.adminId) ? entry.adminId : null,
      adminEmail: entry.adminEmail ?? '',
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      result: entry.result ?? 'SUCCESS',
      ip: entry.ip ?? null,
    });
  },

  async list(opts: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      AuditLogModel.find()
        .sort({ createdAt: -1 })
        .skip((opts.page - 1) * opts.pageSize)
        .limit(opts.pageSize)
        .lean(),
      AuditLogModel.countDocuments(),
    ]);
    return { items: items.map(toDto), total };
  },
};

export const redirectRepository = {
  async listActive() {
    const docs = await RedirectModel.find({ active: true }).lean();
    return docs.map(toDto);
  },
  async upsert(from: string, data: Record<string, unknown>) {
    const doc = await RedirectModel.findOneAndUpdate({ from }, { $set: data }, { new: true, upsert: true }).lean();
    return doc ? toDto(doc) : null;
  },
};
