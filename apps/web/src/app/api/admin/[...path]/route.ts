import type { NextRequest } from 'next/server';
import { forwardJson } from '@/lib/api/adminProxy';

/**
 * Admin API proxy.
 *
 * The admin UI runs in the browser and must never hold the API service token, and
 * cross-origin cookies would need `SameSite=None` to work at all — which weakens the CSRF
 * protection the session depends on. So the admin calls `/api/admin/...` same-origin and
 * this forwards server-side.
 *
 * File uploads are handled by the dedicated `/api/admin/media` route instead, which
 * rebuilds the multipart body rather than forwarding raw bytes.
 */

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return forwardJson(request, (await ctx.params).path);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return forwardJson(request, (await ctx.params).path);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  return forwardJson(request, (await ctx.params).path);
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return forwardJson(request, (await ctx.params).path);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return forwardJson(request, (await ctx.params).path);
}
