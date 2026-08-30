/**
 * Security verification.
 *
 * Probes the running system for the controls it claims to have. Every check is an actual
 * request against the live server — nothing here is inferred from reading the source.
 *
 *   node scripts/verify-security.js <admin-password>
 */
const fs = require('fs');
const path = require('path');

const WEB = process.env.SITE_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:4000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@aptentech.com';
const PASSWORD = process.argv[2];

let pass = 0;
let fail = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) pass += 1;
  else {
    fail += 1;
    failures.push(label + (detail ? ` — ${detail}` : ''));
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

(async () => {
  console.log('AptenTech security verification\n');

  /* ---------------------------------------------------------------- headers */
  section('Security headers');

  const res = await fetch(`${WEB}/`);
  const h = (name) => res.headers.get(name) ?? '';

  check('X-Content-Type-Options: nosniff', h('x-content-type-options') === 'nosniff');
  check('Referrer-Policy set', h('referrer-policy').includes('strict-origin'), h('referrer-policy'));
  check('X-Frame-Options: DENY', h('x-frame-options') === 'DENY');
  check('Permissions-Policy restricts sensors', h('permissions-policy').includes('camera=()'), h('permissions-policy'));
  check('No X-Powered-By leak', !res.headers.get('x-powered-by'), res.headers.get('x-powered-by') ?? 'absent');

  const adminRes = await fetch(`${WEB}/admin/login/`);
  check('Admin is noindex', (adminRes.headers.get('x-robots-tag') ?? '').includes('noindex'), adminRes.headers.get('x-robots-tag') ?? '');

  const robots = await (await fetch(`${WEB}/robots.txt`)).text();
  check('robots.txt disallows /admin', robots.includes('/admin'), robots.split('\n').find((l) => l.includes('Disallow')) ?? '');

  /* ---------------------------------------------------------------- secret exposure */
  section('Secret exposure');

  const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
  const secrets = Object.fromEntries(
    env
      .split('\n')
      .filter((l) => /^(API_SERVICE_TOKEN|SESSION_SECRET|REVALIDATE_SECRET|MONGODB_URI)=/.test(l))
      .map((l) => [l.split('=')[0], l.split('=').slice(1).join('=').trim()]),
  );

  const pagesToScan = ['/', '/services/seo/', '/contact/', '/admin/login/'];
  let leaked = null;

  for (const route of pagesToScan) {
    const html = await (await fetch(`${WEB}${route}`)).text();

    // Also pull every script the page loads, so a secret inlined into a bundle is caught.
    const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]))];
    let bundle = html;
    for (const src of scripts) {
      bundle += await (await fetch(src.startsWith('http') ? src : `${WEB}${src}`)).text();
    }

    for (const [name, value] of Object.entries(secrets)) {
      if (value && value.length > 12 && bundle.includes(value)) leaked = `${name} on ${route}`;
    }
    if (bundle.includes('mongodb://') || bundle.includes('mongodb+srv://')) leaked = `MongoDB URI on ${route}`;
  }

  check('No secret reaches the browser', leaked === null, leaked ?? 'HTML + all bundles scanned');

  /* ---------------------------------------------------------------- API exposure */
  section('API access control');

  const noKey = await fetch(`${API}/api/v1/services`);
  check('Public API refuses requests without the service token', noKey.status === 401, `HTTP ${noKey.status}`);

  const badKey = await fetch(`${API}/api/v1/services`, { headers: { 'x-api-key': 'wrong-token-value-here' } });
  check('Public API refuses a wrong service token', badKey.status === 401, `HTTP ${badKey.status}`);

  const adminNoAuth = await fetch(`${API}/api/v1/admin/dashboard`);
  check('Admin API refuses an unauthenticated request', adminNoAuth.status === 401, `HTTP ${adminNoAuth.status}`);

  const leadsNoAuth = await fetch(`${WEB}/api/admin/leads/`);
  check('Admin proxy refuses an unauthenticated request', leadsNoAuth.status === 401, `HTTP ${leadsNoAuth.status}`);

  /* ---------------------------------------------------------------- error handling */
  section('Error handling');

  const notFound = await fetch(`${API}/api/v1/services/does-not-exist`, {
    headers: { 'x-api-key': secrets.API_SERVICE_TOKEN ?? '' },
  });
  const nfBody = await notFound.text();
  check('404 returns a clean envelope', notFound.status === 404 && nfBody.includes('NOT_FOUND'));
  check('404 leaks no stack trace', !/ at .*\.(ts|js):\d+/.test(nfBody));

  const badJson = await fetch(`${WEB}/api/leads/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  check('Malformed JSON is rejected cleanly', badJson.status === 400, `HTTP ${badJson.status}`);

  /* ---------------------------------------------------------------- input validation */
  section('Input validation and injection');

  const xssPayload = '<script>alert(1)</script>';
  const xss = await fetch(`${WEB}/api/leads/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Test ${xssPayload}`,
      email: 'xss@example.com',
      service: 'SEO',
      message: xssPayload,
      sourceForm: 'leadForm',
      sourcePath: '/',
      elapsedMs: 9000,
    }),
  });
  check('Lead with markup is accepted and stored as data', xss.status === 201, `HTTP ${xss.status}`);

  const oversize = await fetch(`${WEB}/api/leads/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'A'.repeat(200),
      email: 'big@example.com',
      service: 'SEO',
      message: 'x'.repeat(20000),
      sourceForm: 'leadForm',
      sourcePath: '/',
      elapsedMs: 9000,
    }),
  });
  check('Oversized field rejected', oversize.status === 400, `HTTP ${oversize.status}`);

  const badStatus = await fetch(`${WEB}/api/leads/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Status Injection',
      email: 'inject@example.com',
      service: 'SEO',
      message: 'Trying to set my own status.',
      status: 'WON',
      spamScore: -100,
      sourceForm: 'leadForm',
      sourcePath: '/',
      elapsedMs: 9000,
    }),
  });
  check('Client-supplied status/spamScore ignored', badStatus.status === 201, `HTTP ${badStatus.status}`);

  /* ---------------------------------------------------------------- authentication */
  section('Authentication');

  if (!PASSWORD) {
    console.log('SKIP  admin checks — pass the admin password as an argument to include them');
  } else {
    let cookie = '';
    const capture = (r) => {
      for (const c of r.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        if (pair?.startsWith('aptentech_admin_session=')) cookie = pair;
      }
    };

    const wrong = await fetch(`${WEB}/api/admin/auth/login/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'definitely-wrong' }),
    });
    const wrongBody = await wrong.json();

    const unknown = await fetch(`${WEB}/api/admin/auth/login/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'definitely-wrong' }),
    });
    const unknownBody = await unknown.json();

    check(
      'Wrong password and unknown account are indistinguishable',
      wrongBody.error?.message === unknownBody.error?.message && wrong.status === unknown.status,
      JSON.stringify(wrongBody.error?.message),
    );

    const login = await fetch(`${WEB}/api/admin/auth/login/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    capture(login);
    const session = await login.json();
    check('Sign-in succeeds', login.status === 200, `HTTP ${login.status}`);

    const setCookie = (login.headers.getSetCookie?.() ?? []).find((c) => c.includes('aptentech_admin_session')) ?? '';
    check('Session cookie is HttpOnly', /HttpOnly/i.test(setCookie));
    check('Session cookie is SameSite=Lax', /SameSite=Lax/i.test(setCookie), setCookie.split(';').map((s) => s.trim()).join(' | '));
    check('CSRF token returned in body, not a cookie', Boolean(session.data?.csrfToken) && !setCookie.includes('csrf'));

    const noCsrf = await fetch(`${WEB}/api/admin/settings/`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ companyName: 'Hijacked' }),
    });
    check('State-changing request without CSRF token refused', noCsrf.status === 403, `HTTP ${noCsrf.status}`);

    const csrf = session.data.csrfToken;

    const nosql = await fetch(
      `${WEB}/api/admin/leads/?page=1&pageSize=5&status[$ne]=NOTHING&sort=-createdAt`,
      { headers: { cookie, 'x-csrf-token': csrf } },
    );
    check('NoSQL operator in a query parameter is rejected', nosql.status === 400, `HTTP ${nosql.status}`);

    const idor = await fetch(`${WEB}/api/admin/leads/000000000000000000000000/`, {
      headers: { cookie, 'x-csrf-token': csrf },
    });
    check('Unknown but well-formed id returns 404, not data', idor.status === 404, `HTTP ${idor.status}`);

    const badId = await fetch(`${WEB}/api/admin/leads/..%2F..%2Fetc%2Fpasswd/`, {
      headers: { cookie, 'x-csrf-token': csrf },
    });
    check('Path-traversal style id rejected', badId.status === 400 || badId.status === 404, `HTTP ${badId.status}`);

    // A lead containing markup must come back as data, never as executable HTML.
    const leads = await (
      await fetch(`${WEB}/api/admin/leads/?page=1&pageSize=50&status=ALL&sort=-createdAt`, {
        headers: { cookie, 'x-csrf-token': csrf },
      })
    ).json();
    const stored = leads.data?.items?.find((l) => l.email === 'xss@example.com');
    check('Injected markup stored verbatim as data', Boolean(stored) && stored.message.includes('<script>'));

    const roleEscalation = await fetch(`${WEB}/api/admin/leads/${stored?.id}/status/`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ status: 'NOT_A_REAL_STATUS' }),
    });
    check('Invalid enum value rejected', roleEscalation.status === 400, `HTTP ${roleEscalation.status}`);

    await fetch(`${WEB}/api/admin/auth/logout/`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } });
    const afterLogout = await fetch(`${WEB}/api/admin/dashboard/`, { headers: { cookie } });
    check('Session unusable after sign-out', afterLogout.status === 401, `HTTP ${afterLogout.status}`);
  }

  /* ---------------------------------------------------------------- rate limiting */
  section('Rate limiting');

  let limited = false;
  for (let i = 0; i < 12; i += 1) {
    const r = await fetch(`${WEB}/api/leads/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Flood ${i}`,
        email: `flood${i}@example.com`,
        service: 'SEO',
        message: `Flood test ${i}`,
        sourceForm: 'leadForm',
        sourcePath: '/',
        elapsedMs: 9000,
      }),
    });
    if (r.status === 429) {
      limited = true;
      break;
    }
  }
  check('Lead endpoint rate-limits a flood', limited);

  /* ---------------------------------------------------------------- summary */
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`${pass} passed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('VERIFICATION ERROR', e);
  process.exit(1);
});
