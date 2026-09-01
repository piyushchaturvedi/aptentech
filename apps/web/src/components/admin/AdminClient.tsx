'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminUser } from '@aptentech/shared';

/**
 * Admin data layer.
 *
 * One place that knows how to call the admin API: it attaches the CSRF token to every
 * state-changing request and handles a lapsed session by sending the user back to sign in.
 *
 * The CSRF token is held in memory, never in a cookie or localStorage. That asymmetry is
 * the point of double-submit — a cross-site page can cause the browser to send the session
 * cookie, but it cannot read this value to match it.
 */

interface Session {
  user: AdminUser;
  csrfToken: string;
}

interface AdminContextValue {
  session: Session | null;
  loading: boolean;
  request: <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;
  signIn: (email: string, password: string) => Promise<AdminUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

/**
 * Builds an admin API URL with a trailing slash on the path.
 *
 * `trailingSlash: true` is required so the site's canonical URLs match the ones the source
 * published, and it applies to route handlers too. Calling `/api/admin/media` therefore
 * 308-redirects to `/api/admin/media/` — and when the browser replays a `FormData` body
 * across that redirect it generates a fresh multipart boundary while resending the original
 * `content-type`, so the server sees a boundary that never appears in the body and the
 * upload fails to parse. Requesting the slashed URL directly avoids the redirect entirely.
 */
export function adminUrl(path: string): string {
  const [rawPath = '', query] = path.split('?');
  const withSlash = rawPath.endsWith('/') ? rawPath : `${rawPath}/`;
  return `/api/admin${withSlash}${query ? `?${query}` : ''}`;
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(adminUrl('/auth/me'), { cache: 'no-store' });
      if (!res.ok) {
        setSession(null);
        return;
      }
      const body = await res.json();
      setSession({ user: body.data.user, csrfToken: body.data.csrfToken });
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
      const { json, headers, ...rest } = init;
      const method = rest.method ?? (json ? 'POST' : 'GET');

      const finalHeaders = new Headers(headers);
      if (json !== undefined && !(json instanceof FormData)) finalHeaders.set('content-type', 'application/json');
      if (session?.csrfToken) finalHeaders.set('x-csrf-token', session.csrfToken);

      const res = await fetch(adminUrl(path), {
        ...rest,
        method,
        headers: finalHeaders,
        cache: 'no-store',
        ...(json !== undefined
          ? { body: json instanceof FormData ? json : JSON.stringify(json) }
          : {}),
      });

      if (res.status === 401) {
        setSession(null);
        router.push('/admin/login/');
        throw new AdminApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        if (!res.ok) throw new AdminApiError(res.status, 'REQUEST_FAILED', 'That request failed.');
        return (await res.blob()) as unknown as T;
      }

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new AdminApiError(
          res.status,
          body?.error?.code ?? 'REQUEST_FAILED',
          body?.error?.message ?? 'That request failed.',
          body?.error?.details,
        );
      }
      return body.data as T;
    },
    [session?.csrfToken, router],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(adminUrl('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new AdminApiError(res.status, body?.error?.code ?? 'LOGIN_FAILED', body?.error?.message ?? 'Sign-in failed.');
    }
    setSession({ user: body.data.user, csrfToken: body.data.csrfToken });
    return body.data.user as AdminUser;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(adminUrl('/auth/logout'), {
        method: 'POST',
        headers: session?.csrfToken ? { 'x-csrf-token': session.csrfToken } : {},
      });
    } finally {
      setSession(null);
      router.push('/admin/login/');
    }
  }, [session?.csrfToken, router]);

  const value = useMemo(
    () => ({ session, loading, request, signIn, signOut, refresh }),
    [session, loading, request, signIn, signOut, refresh],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider');
  return ctx;
}
