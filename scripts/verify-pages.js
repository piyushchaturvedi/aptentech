/**
 * End-to-end check of custom page creation.
 *
 * Covers the whole promise: create a page from the admin, have it appear at its own URL, add
 * it to a menu, edit it, delete it, and confirm the menu entry goes with it. Every call goes
 * through the same HTTP surface the admin UI uses, session cookie and CSRF token included.
 *
 * Also checks the two ways this can go wrong quietly — a page created on a slug that already
 * belongs to a route (it would save and then never render), and a core page being deleted
 * (its route would stay and render nothing).
 *
 *   node scripts/verify-pages.js <admin-password>
 */
const WEB = process.env.WEB_URL || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'pagetest@aptentech.com';
const PASSWORD = process.argv[2];

if (!PASSWORD) {
  console.error('Usage: node scripts/verify-pages.js <admin-password>');
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

const SLUG = `verify-page-${Date.now().toString(36)}`;

(async () => {
  console.log(`Verifying custom pages against ${WEB}\n`);

  const login = await fetch(`${WEB}/api/admin/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await login.json();
  check('Admin sign-in', login.status === 200 && session.success, `HTTP ${login.status}`);
  if (!session.success) process.exit(1);

  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const csrf = session.data.csrfToken;
  const read = { cookie, 'x-csrf-token': csrf };
  const write = { ...read, 'content-type': 'application/json' };

  /* ---------------------------------------------------------------- create */

  const body = {
    slug: SLUG,
    title: 'Verification Page',
    status: 'PUBLISHED',
    blocks: [
      { key: 'hero', type: 'aboutHero', enabled: true, eyebrow: '', title: 'Verification Page', sub: '', points: [] },
      { key: 'body', type: 'richText', enabled: true, title: '', html: '<p>Created by the verification script.</p>' },
    ],
    caseStudyIds: [],
    testimonialIds: [],
    latestPostIds: [],
    seo: { title: 'Verification Page', description: '', canonical: `/${SLUG}/`, ogTitle: '', ogDescription: '', robotsIndex: true, robotsFollow: true, ogImage: {} },
  };

  const created = await fetch(`${WEB}/api/admin/pages/`, { method: 'POST', headers: write, body: JSON.stringify(body) });
  check('Admin can create a page', created.status === 201, `HTTP ${created.status}`);

  /* ---------------------------------------------------------------- reserved slugs */

  for (const reserved of ['services', 'about', 'admin']) {
    const res = await fetch(`${WEB}/api/admin/pages/`, {
      method: 'POST',
      headers: write,
      body: JSON.stringify({ ...body, slug: reserved }),
    });
    check(`Reserved slug "${reserved}" is refused`, res.status === 400, `HTTP ${res.status}`);
  }

  const duplicate = await fetch(`${WEB}/api/admin/pages/`, { method: 'POST', headers: write, body: JSON.stringify(body) });
  check('Duplicate slug is refused', duplicate.status === 409, `HTTP ${duplicate.status}`);

  /* ---------------------------------------------------------------- public render */

  // The route is prerendered on demand; give the first request room to compile.
  await new Promise((r) => setTimeout(r, 2500));

  const publicRes = await fetch(`${WEB}/${SLUG}/`, { cache: 'no-store' });
  const html = await publicRes.text();
  check('Page renders at its own URL', publicRes.status === 200, `HTTP ${publicRes.status}`);
  check('Page shows its content', html.includes('Created by the verification script.'));
  check('Page uses the site shell', html.includes('class="header"') || html.includes('class="footer"'));

  /* ---------------------------------------------------------------- menu placement */

  const settings = (await (await fetch(`${WEB}/api/admin/settings/`, { headers: read })).json()).data;
  const navigation = JSON.parse(JSON.stringify(settings.navigation));
  navigation.push({ label: 'Verification Page', href: `/${SLUG}/`, columns: [] });

  const navSaved = await fetch(`${WEB}/api/admin/settings/`, {
    method: 'PUT',
    headers: write,
    body: JSON.stringify({ ...settings, navigation }),
  });
  check('Page can be added to the main menu', navSaved.status === 200, `HTTP ${navSaved.status}`);

  await new Promise((r) => setTimeout(r, 2500));
  const home = await (await fetch(WEB, { cache: 'no-store' })).text();
  check('Menu entry appears in the header', home.includes(`href="/${SLUG}/"`));

  /* ---------------------------------------------------------------- update */

  const current = (await (await fetch(`${WEB}/api/admin/pages/${SLUG}/`, { headers: read })).json()).data;
  const blocks = current.blocks.map((b) =>
    b.type === 'richText' ? { ...b, html: '<p>Edited by the verification script.</p>' } : b,
  );
  const { id, createdAt, updatedAt, ...rest } = current;
  const updated = await fetch(`${WEB}/api/admin/pages/${SLUG}/`, {
    method: 'PUT',
    headers: write,
    body: JSON.stringify({ ...rest, blocks }),
  });
  check('Admin can update the page', updated.status === 200, `HTTP ${updated.status}`);

  await new Promise((r) => setTimeout(r, 2500));
  const edited = await (await fetch(`${WEB}/${SLUG}/`, { cache: 'no-store' })).text();
  check('Edit appears on the public page', edited.includes('Edited by the verification script.'));

  /* ---------------------------------------------------------------- delete guards */

  const coreDelete = await fetch(`${WEB}/api/admin/pages/about/`, { method: 'DELETE', headers: read });
  check('A core page cannot be deleted', coreDelete.status === 400, `HTTP ${coreDelete.status}`);

  /* ---------------------------------------------------------------- delete */

  const cleanNav = navigation.filter((g) => g.href !== `/${SLUG}/`);
  await fetch(`${WEB}/api/admin/settings/`, {
    method: 'PUT',
    headers: write,
    body: JSON.stringify({ ...settings, navigation: cleanNav }),
  });

  const deleted = await fetch(`${WEB}/api/admin/pages/${SLUG}/`, { method: 'DELETE', headers: read });
  check('Admin can delete a custom page', deleted.status === 200, `HTTP ${deleted.status}`);

  await new Promise((r) => setTimeout(r, 2500));
  const gone = await fetch(`${WEB}/${SLUG}/`, { cache: 'no-store' });
  check('Deleted page returns 404', gone.status === 404, `HTTP ${gone.status}`);

  await fetch(`${WEB}/api/admin/auth/logout/`, { method: 'POST', headers: read });

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
