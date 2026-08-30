'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdmin } from './AdminClient';

/**
 * Admin chrome: sidebar, header, and the client-side auth gate.
 *
 * The gate here is a convenience — it stops an unauthenticated user seeing an empty
 * dashboard flash before a redirect. It is not the security boundary: the Node API
 * independently authenticates and authorises every request, so bypassing this UI achieves
 * nothing.
 *
 * A user with `mustChangePassword` is held on the password screen; the API refuses their
 * other requests until it is done, so the two agree.
 */

const NAV = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard' },
      { href: '/admin/leads', label: 'Leads' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/pages', label: 'Pages' },
      { href: '/admin/services', label: 'Services' },
      { href: '/admin/solutions', label: 'Solutions' },
      { href: '/admin/case-studies', label: 'Case studies' },
      { href: '/admin/blog', label: 'Blog' },
      { href: '/admin/testimonials', label: 'Testimonials' },
      { href: '/admin/faqs', label: 'FAQs' },
    ],
  },
  {
    label: 'Site',
    items: [
      { href: '/admin/media', label: 'Media' },
      { href: '/admin/seo', label: 'SEO' },
      { href: '/admin/settings', label: 'Settings' },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { session, loading, signOut } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();

  const isLogin = pathname === '/admin/login';
  const needsPasswordChange = Boolean(session?.user.mustChangePassword);

  useEffect(() => {
    if (loading) return;
    if (!session && !isLogin) router.replace('/admin/login');
    if (session && isLogin && !needsPasswordChange) router.replace('/admin/dashboard');
  }, [loading, session, isLogin, needsPasswordChange, router]);

  if (isLogin) return <>{children}</>;

  if (loading) {
    return (
      <div className="adm-login">
        <p style={{ color: 'var(--a-muted)' }}>Loading…</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#3A31DB" />
            <path d="M9 21.5 16 10l7 11.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="16" cy="23" r="2.4" fill="#00C9A7" />
          </svg>
          AptenTech CMS
        </div>

        {NAV.map((group) => (
          <div key={group.label}>
            <div className="adm-navlabel">{group.label}</div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <Link href="/" target="_blank" rel="noopener">
            View site ↗
          </Link>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-top">
          <h1 style={{ fontSize: '1.05rem' }}>{titleFor(pathname)}</h1>
          <div className="adm-who">
            <span style={{ color: 'var(--a-muted)' }}>
              {session.user.name} · {session.user.role.replace('_', ' ').toLowerCase()}
            </span>
            <button className="adm-btn ghost sm" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>

        <div className="adm-body">
          {needsPasswordChange && pathname !== '/admin/settings' ? (
            <div className="adm-alert warn">
              This account is still using a temporary password.{' '}
              <Link href="/admin/settings">Set a new one</Link> to unlock the rest of the CMS.
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}

function titleFor(pathname: string): string {
  const match = NAV.flatMap((g) => g.items).find(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  return match?.label ?? 'Dashboard';
}
