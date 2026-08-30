import type { Response } from 'express';
import type { Paginated } from '@aptentech/shared';

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

export function paginated<T>(res: Response, items: T[], total: number, page: number, pageSize: number): Response {
  const payload: Paginated<T> = {
    items,
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
  return res.status(200).json({ success: true, data: payload });
}
