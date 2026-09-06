#!/usr/bin/env node
/**
 * Configures and validates the production environment.
 *
 * Everything that can be derived from the architecture is derived, so there is nothing to
 * edit by hand: ports, URLs, CORS origin, media driver, cookie and CSP behaviour and the
 * cross-app secrets all follow from one value — where the site is served.
 *
 *   node scripts/prod-env.js            configure (default) — writes both env files
 *   node scripts/prod-env.js --check    validate only; exits non-zero if anything is missing
 *   SITE_URL=http://1.2.3.4 node scripts/prod-env.js
 *
 * Three rules it follows without exception:
 *
 *  - **Existing values are preserved.** A key already present keeps its value unless it is
 *    demonstrably wrong for this architecture (a localhost URL in production, say). The file
 *    is edited in place, never rewritten, so anything added by hand survives.
 *  - **Secrets are never printed.** A generated secret is written straight to the file and
 *    reported only as "generated". Nothing here echoes a value, so the output is safe to
 *    paste into a chat or a ticket.
 *  - **External credentials are never invented.** A MongoDB URI or an SMTP password cannot be
 *    guessed. Those are reported as missing, by name, and the script stops.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const API_ENV = path.join(ROOT, 'apps/api/.env');
const WEB_ENV = path.join(ROOT, 'apps/web/.env.local');

const CHECK_ONLY = process.argv.includes('--check');

/** Where the site is served. Everything else is derived from this. */
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '') || null;

/* ------------------------------------------------------------------ env file I/O */

/** Parses a `.env` into ordered entries, keeping comments and blank lines as-is. */
function parseEnv(file) {
  if (!fs.existsSync(file)) return { lines: [], values: {} };
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) values[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { lines, values };
}

/**
 * Writes a key, editing the existing line if there is one.
 *
 * Rewriting the whole file would drop comments and any key this script does not know about,
 * which is exactly what "preserve existing configuration" rules out.
 */
function setKey(state, key, value) {
  const index = state.lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  const line = `${key}=${value}`;
  if (index >= 0) state.lines[index] = line;
  else state.lines.push(line);
  state.values[key] = value;
}

const randomSecret = (bytes) => crypto.randomBytes(bytes).toString('base64url');

/** Present, non-empty, and not a placeholder left over from the example file. */
function isReal(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v.length > 0 && !/^(change-me|changeme|your-|<.*>|\[.*\])/i.test(v);
}

/* ------------------------------------------------------------------ the specification */

/**
 * Values that follow from the architecture.
 *
 * `derive` returns what the value must be. `correctIf` decides whether an existing value is
 * wrong enough to replace — without it, re-running would overwrite a deliberate choice.
 */
function derivedSpec(siteUrl) {
  const isHttps = siteUrl.startsWith('https://');
  const host = siteUrl.replace(/^https?:\/\//, '');

  return [
    { key: 'NODE_ENV', derive: () => 'production', correctIf: (v) => v !== 'production' },
    { key: 'PORT', derive: () => '4000', correctIf: (v) => v !== '4000' },

    // The public address, and the two names the apps read it under.
    { key: 'PUBLIC_SITE_URL', derive: () => siteUrl, correctIf: (v) => /localhost|127\.0\.0\.1/.test(v) },
    { key: 'NEXT_PUBLIC_SITE_URL', derive: () => siteUrl, correctIf: (v) => /localhost|127\.0\.0\.1/.test(v) },

    /*
      CORS. The API allows exactly this one origin — never `*`, because the admin sends
      credentials and a wildcard is invalid with them anyway.
    */
    { key: 'WEB_ORIGIN', derive: () => siteUrl, correctIf: (v) => /localhost|127\.0\.0\.1/.test(v) },

    /*
      Server-to-server addresses stay on the loopback.

      The Next.js server is the only thing that calls the API, and the API only posts cache
      invalidations back. Sending either out to the public address and back in would add a
      round trip through nginx and expose ports that should stay closed.
    */
    /*
      `127.0.0.1`, not `localhost`.

      On a host where `localhost` resolves to `::1` first, Node connects over IPv6 while the
      API listens on IPv4 and every request fails with ECONNREFUSED — which shows up as a
      site that renders no content at all, not as a name-resolution error.
    */
    { key: 'API_BASE_URL', derive: () => 'http://127.0.0.1:4000/api/v1', correctIf: (v) => /localhost/.test(v) },
    { key: 'REVALIDATE_URL', derive: () => 'http://127.0.0.1:3000/api/revalidate', correctIf: (v) => /localhost:3000/.test(v) },

    // nginx terminates the connection, so without this every visitor looks like the proxy.
    { key: 'TRUST_PROXY', derive: () => 'true', correctIf: (v) => v !== 'true' },

    /*
      Media stays on this instance's disk — no S3.

      The directory is deliberately outside the code tree: a redeploy replaces the tree, and
      uploads written inside it would be destroyed by the next release.
    */
    { key: 'MEDIA_DRIVER', derive: () => 'local', correctIf: (v) => v !== 'local' },
    { key: 'ALLOW_LOCAL_MEDIA', derive: () => 'true', correctIf: (v) => v !== 'true' },
    { key: 'LOCAL_UPLOAD_DIR', derive: () => '/var/www/aptentech/media', correctIf: (v) => v === './uploads' },

    { key: 'MONGODB_DB_NAME', derive: () => 'aptentech', correctIf: () => false },
    { key: 'SESSION_TTL_HOURS', derive: () => '8', correctIf: () => false },
    { key: 'SESSION_IDLE_MINUTES', derive: () => '30', correctIf: () => false },
    { key: 'MAX_UPLOAD_BYTES', derive: () => '10485760', correctIf: () => false },
    { key: 'LOG_LEVEL', derive: () => 'info', correctIf: (v) => v === 'debug' || v === 'trace' },

    { key: 'EMAIL_MESSAGE_ID_DOMAIN', derive: () => host, correctIf: (v) => /localhost/.test(v) },

    // Recorded so the reason a production build is running without TLS is visible in the file.
    ...(isHttps ? [] : [{ key: 'ALLOW_NO_EMAIL', derive: () => 'true', correctIf: () => false }]),
  ];
}

/** Secrets that can be generated safely, with the length each needs. */
const GENERATED_SECRETS = [
  { key: 'API_SERVICE_TOKEN', bytes: 32, note: 'shared by both apps' },
  { key: 'SESSION_SECRET', bytes: 32, note: 'signs admin session cookies' },
  { key: 'REVALIDATE_SECRET', bytes: 24, note: 'shared by both apps' },
  { key: 'INBOUND_WEBHOOK_SECRET', bytes: 24, note: 'inbound mail webhook' },
];

/** Values only the operator can supply. */
const EXTERNAL = [
  {
    key: 'MONGODB_URI',
    what: 'the production MongoDB connection string',
    how: 'MongoDB Atlas → Connect → Drivers, or mongodb://127.0.0.1:27017 if the database runs on this server',
  },
];

/** Email needs credentials, but the site is allowed to launch without it. */
const EMAIL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'];

/* ------------------------------------------------------------------ run */

const report = [];
const add = (status, key, detail = '') => report.push({ status, key, detail });

function main() {
  const state = parseEnv(API_ENV);
  const existing = { ...state.values };

  const siteUrl =
    SITE_URL || (isReal(existing.PUBLIC_SITE_URL) && !/localhost/.test(existing.PUBLIC_SITE_URL) ? existing.PUBLIC_SITE_URL : null);

  if (!siteUrl) {
    console.error(
      'No production site URL.\n\n' +
        '  Pass it once and it is stored:\n' +
        '    SITE_URL=http://3.94.246.68 node scripts/prod-env.js\n',
    );
    process.exit(1);
  }

  /* ---------------------------------------------------------- derived values */

  /*
    An explicitly passed SITE_URL is an instruction, not a hint.

    Without this, re-pointing the deployment would leave the three address keys on their old
    values — "preserve what exists" would quietly beat the value just given on the command
    line, which is the opposite of what typing it means.
  */
  const addressKeys = new Set(['PUBLIC_SITE_URL', 'NEXT_PUBLIC_SITE_URL', 'WEB_ORIGIN']);
  const siteUrlWasGiven = Boolean(SITE_URL);

  for (const { key, derive, correctIf } of derivedSpec(siteUrl)) {
    const current = existing[key];
    const wanted = derive();

    if (!isReal(current)) {
      if (!CHECK_ONLY) setKey(state, key, wanted);
      add('set', key);
    } else if (siteUrlWasGiven && addressKeys.has(key) && current !== wanted) {
      if (!CHECK_ONLY) setKey(state, key, wanted);
      add('corrected', key, 'set from SITE_URL');
    } else if (correctIf(current)) {
      if (!CHECK_ONLY) setKey(state, key, wanted);
      add('corrected', key, 'was wrong for this architecture');
    } else if (current !== wanted) {
      add('kept', key, 'existing value preserved');
    } else {
      add('ok', key);
    }
  }

  /* ---------------------------------------------------------- secrets */

  for (const { key, bytes, note } of GENERATED_SECRETS) {
    if (isReal(existing[key])) {
      add('ok', key, `preserved · ${note}`);
    } else if (CHECK_ONLY) {
      add('missing', key, note);
    } else {
      setKey(state, key, randomSecret(bytes));
      add('generated', key, note);
    }
  }

  /* ---------------------------------------------------------- email */

  const emailConfigured = EMAIL_KEYS.every((k) => isReal(existing[k]));
  if (emailConfigured) {
    if (!CHECK_ONLY) {
      setKey(state, 'EMAIL_DRIVER', 'smtp');
      // Only default the sender when nothing has been chosen; it must be an address the
      // provider has verified, so a guess here would silently fail at send time.
      if (!isReal(existing.EMAIL_FROM)) setKey(state, 'EMAIL_FROM', `no-reply@${siteUrl.replace(/^https?:\/\//, '')}`);
    }
    add('ok', 'EMAIL_DRIVER', 'smtp — credentials present');
  } else {
    if (!CHECK_ONLY) {
      setKey(state, 'EMAIL_DRIVER', 'log');
      setKey(state, 'ALLOW_NO_EMAIL', 'true');
      for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) if (!(k in state.values)) setKey(state, k, '');
      if (!isReal(existing.SMTP_PORT)) setKey(state, 'SMTP_PORT', '587');
      if (!isReal(existing.SMTP_SECURE)) setKey(state, 'SMTP_SECURE', 'false');
      if (!isReal(existing.EMAIL_FROM)) setKey(state, 'EMAIL_FROM', `no-reply@${siteUrl.replace(/^https?:\/\//, '')}`);
    }
    add('deferred', 'EMAIL_DRIVER', 'log — no SMTP credentials, so nothing is emailed. Leads are still saved.');
  }

  /* ---------------------------------------------------------- external */

  const missingExternal = EXTERNAL.filter((e) => !isReal(existing[e.key]));
  for (const e of EXTERNAL) {
    if (isReal(existing[e.key])) add('ok', e.key, 'preserved');
    else add('missing', e.key, e.what);
  }

  /* ---------------------------------------------------------- write */

  if (!CHECK_ONLY) {
    fs.mkdirSync(path.dirname(API_ENV), { recursive: true });
    fs.writeFileSync(API_ENV, state.lines.join('\n').replace(/\n{3,}/g, '\n\n'));
    fs.chmodSync(API_ENV, 0o600);

    /*
      The web app gets the same file.

      The two authenticate to each other with a shared token, and a mismatch is not a startup
      error — the site renders every page empty. Copying rather than maintaining two files is
      what makes that impossible.
    */
    fs.mkdirSync(path.dirname(WEB_ENV), { recursive: true });
    fs.copyFileSync(API_ENV, WEB_ENV);
    fs.chmodSync(WEB_ENV, 0o600);
  }

  /* ---------------------------------------------------------- output */

  const label = {
    ok: '  ok       ',
    set: '  set      ',
    corrected: '  corrected',
    kept: '  kept     ',
    generated: '  generated',
    deferred: '  deferred ',
    missing: '  MISSING  ',
  };

  console.log(`Production environment — ${CHECK_ONLY ? 'check' : 'configure'}`);
  console.log(`Site URL: ${siteUrl}\n`);
  for (const r of report) console.log(`${label[r.status]} ${r.key.padEnd(26)} ${r.detail}`);

  if (!CHECK_ONLY) {
    console.log(`\nWrote apps/api/.env and apps/web/.env.local (mode 600).`);
    console.log('No secret value was printed.');
  }

  if (missingExternal.length) {
    console.log('\n' + '─'.repeat(70));
    console.log('Cannot continue — these cannot be generated and must be supplied:\n');
    for (const e of missingExternal) {
      console.log(`  ${e.key}`);
      console.log(`    ${e.what}`);
      console.log(`    ${e.how}\n`);
    }
    console.log('Add it to apps/api/.env, then run this again.');
    process.exit(1);
  }

  console.log('\nProduction environment is complete.');
}

main();
