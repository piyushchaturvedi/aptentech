'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/components/admin/AdminClient';

/**
 * Admin sign-in.
 *
 * The form reports a single generic failure regardless of whether the address exists, the
 * password is wrong or the account is inactive — matching what the API returns, so the
 * response cannot be used to enumerate accounts. Lockout is the one case with its own
 * message, because a user needs to know why waiting will help.
 */
export default function LoginPage() {
  const { signIn } = useAdmin();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const user = await signIn(email, password);
      router.replace(user.mustChangePassword ? '/admin/settings' : '/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-login">
      <div className="adm-login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#3A31DB" />
            <path d="M9 21.5 16 10l7 11.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="16" cy="23" r="2.4" fill="#00C9A7" />
          </svg>
          <div>
            <h1 style={{ fontSize: '1.15rem' }}>AptenTech CMS</h1>
            <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>Sign in to manage the site</p>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          {error ? (
            <div className="adm-alert error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="adm-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              className="adm-input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="adm-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="adm-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="adm-btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
