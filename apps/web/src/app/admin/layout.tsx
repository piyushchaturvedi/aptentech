import type { Metadata } from 'next';
import { AdminProvider } from '@/components/admin/AdminClient';
import { AdminShell } from '@/components/admin/AdminShell';
import '@/styles/admin.css';

/**
 * Admin shell.
 *
 * Lives inside the same Next.js application as the public site but in its own route group,
 * with its own layout and stylesheet — the public design and the admin UI share nothing,
 * so neither can affect the other.
 *
 * `noindex` is set here and again as an `X-Robots-Tag` header in next.config, because a
 * meta tag alone does not cover non-HTML responses.
 */
export const metadata: Metadata = {
  title: 'AptenTech CMS',
  robots: { index: false, follow: false, nocache: true },
};

// Admin data is per-user and must never be cached or statically rendered.
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm">
      <AdminProvider>
        <AdminShell>{children}</AdminShell>
      </AdminProvider>
    </div>
  );
}
