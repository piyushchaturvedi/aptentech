/**
 * Proves the CMS round trip: edit in the admin, see it on the public site.
 *
 * This is the claim that matters most about the architecture, and it is the one easiest to
 * get wrong without noticing — a page can look correct because it was built from the right
 * data once, while the invalidation path that keeps it correct is quietly broken.
 *
 * Every step goes through the real HTTP surface the admin UI uses, including the session
 * cookie and CSRF token, so nothing here can pass by touching MongoDB directly.
 *
 *   node scripts/verify-cms-flow.js <admin-password>
 */
const WEB = process.env.WEB_URL || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'cmstest@aptentech.com';
const PASSWORD = process.argv[2];

if (!PASSWORD) {
  console.error('Usage: node scripts/verify-cms-flow.js <admin-password>');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? `  — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`);
  }
}

/** Strips markup so a heading can be compared as the reader sees it. */
function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function publicPage(path) {
  // `no-store` so this reads what a fresh visitor gets rather than a cached copy of it.
  const res = await fetch(WEB + path, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  return text(await res.text());
}

(async () => {
  console.log(`Verifying the CMS round trip against ${WEB}\n`);

  /* ---------------------------------------------------------------- sign in */

  const login = await fetch(`${WEB}/api/admin/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const session = await login.json();
  check('Admin sign-in', login.status === 200 && session.success === true, `HTTP ${login.status}`);
  if (!session.success) {
    console.log('\nCannot continue without a session.');
    process.exit(1);
  }

  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const csrf = session.data.csrfToken;
  const auth = { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' };

  /* ---------------------------------------------------------------- home page hero */

  const before = await publicPage('/');

  const pageRes = await fetch(`${WEB}/api/admin/pages/home/`, { headers: { cookie, 'x-csrf-token': csrf } });
  const page = (await pageRes.json()).data;
  check('Admin can read the home page', pageRes.status === 200 && Boolean(page), `HTTP ${pageRes.status}`);

  const hero = page.blocks.find((b) => b.type === 'homeHero');
  check('Home page has an editable hero block', Boolean(hero?.splitHeading));

  const original = hero.splitHeading.highlight;
  const marker = `verified-${Date.now().toString(36)}`;

  hero.splitHeading = { ...hero.splitHeading, highlight: marker };

  const save = await fetch(`${WEB}/api/admin/pages/home/`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(page),
  });
  check('Admin can save the edit', save.status === 200, `HTTP ${save.status}`);

  /*
    A moment for the revalidation webhook to land.

    The API fires it at Next after the write commits, so the two are not synchronous. This is
    a real wait, not a workaround: a visitor's next request is what triggers the re-render.
  */
  await new Promise((r) => setTimeout(r, 2500));

  const after = await publicPage('/');
  check('Edited heading appears on the public site', after.includes(marker), marker);
  check('Public site changed', before !== after);

  /* ---------------------------------------------------------------- restore */

  const restoreRes = await fetch(`${WEB}/api/admin/pages/home/`, { headers: { cookie, 'x-csrf-token': csrf } });
  const restorePage = (await restoreRes.json()).data;
  const restoreHero = restorePage.blocks.find((b) => b.type === 'homeHero');
  restoreHero.splitHeading = { ...restoreHero.splitHeading, highlight: original };

  const restored = await fetch(`${WEB}/api/admin/pages/home/`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(restorePage),
  });
  check('Original heading restored', restored.status === 200, `HTTP ${restored.status}`);

  await new Promise((r) => setTimeout(r, 2500));
  const final = await publicPage('/');
  check('Public site shows the original again', final.includes(original) && !final.includes(marker));

  /* ---------------------------------------------------------------- media */

  const media = await fetch(`${WEB}/api/admin/media/?page=1&pageSize=5`, { headers: { cookie, 'x-csrf-token': csrf } });
  const mediaBody = await media.json();
  const assets = mediaBody.data?.items ?? [];
  check('Admin can list media', media.status === 200 && assets.length > 0, `${assets.length} assets`);

  const withUrl = assets.find((a) => a.url);
  if (withUrl) {
    const asset = await fetch(WEB + withUrl.url);
    check('A media asset is served to the browser', asset.status === 200, `HTTP ${asset.status}`);
  }

  /* ---------------------------------------------------------------- other collections */

  for (const [label, path] of [
    ['services', '/api/admin/content/service/'],
    ['case studies', '/api/admin/case-studies/'],
    ['blog posts', '/api/admin/blog/'],
    ['testimonials', '/api/admin/testimonials/'],
    ['FAQs', '/api/admin/faqs/'],
    ['settings', '/api/admin/settings/'],
    ['email templates', '/api/admin/email-templates/'],
  ]) {
    const res = await fetch(WEB + path, { headers: { cookie, 'x-csrf-token': csrf } });
    const body = await res.json().catch(() => ({}));
    const data = body.data;
    const count = Array.isArray(data) ? data.length : Array.isArray(data?.items) ? data.items.length : data ? 1 : 0;
    check(`Admin can read ${label}`, res.status === 200 && count > 0, `${count} record(s)`);
  }

  await fetch(`${WEB}/api/admin/auth/logout/`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } });

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
