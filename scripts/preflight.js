#!/usr/bin/env node
/**
 * Pre-deployment check.
 *
 * Reads the configuration and the database the way production will, and reports what would
 * go wrong. It changes nothing — the point is to find the problems while there is still time
 * to fix them, rather than after the domain is pointing at the site.
 *
 * Findings come in three severities:
 *
 *   BLOCKER  the deploy will fail, or will ship something untrue about the company
 *   WARNING  it will work, but with a consequence worth accepting on purpose
 *   OK       checked and fine
 *
 * Exits non-zero if any blocker is found, so it can gate a deploy pipeline.
 *
 *   node scripts/preflight.js
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

let blockers = 0;
let warnings = 0;

function report(level, label, detail = '') {
  if (level === 'BLOCKER') blockers += 1;
  if (level === 'WARNING') warnings += 1;
  const tag = level.padEnd(7);
  console.log(`${tag} ${label}${detail ? `\n        ${detail.replace(/\n/g, '\n        ')}` : ''}`);
}

/** Reads a `.env` file into a map, ignoring comments and blank lines. */
function readEnv(file) {
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** A value that is present, not a placeholder, and not the development default. */
function isReal(value) {
  if (!value) return false;
  const v = value.trim();
  return v.length > 0 && !/change-me|changeme|your-|example\.com|localhost|^\[.*\]$/i.test(v);
}

(async () => {
  console.log('AptenTech pre-deployment check\n');

  /* ------------------------------------------------------------------ configuration */

  console.log('Configuration');

  const apiEnv = readEnv(path.join(ROOT, 'apps/api/.env'));
  const webEnv = readEnv(path.join(ROOT, 'apps/web/.env.local'));

  if (!apiEnv) report('BLOCKER', 'apps/api/.env is missing', 'Copy .env.production.example and fill it in.');
  if (!webEnv) report('BLOCKER', 'apps/web/.env.local is missing', 'The web app needs its own copy.');

  if (apiEnv && webEnv) {
    if (apiEnv.NODE_ENV !== 'production') {
      report('BLOCKER', `NODE_ENV is "${apiEnv.NODE_ENV ?? 'unset'}"`, 'Set NODE_ENV=production on both apps.');
    } else {
      report('OK', 'NODE_ENV=production');
    }

    for (const key of ['API_SERVICE_TOKEN', 'SESSION_SECRET', 'REVALIDATE_SECRET']) {
      if (!isReal(apiEnv[key])) {
        report('BLOCKER', `${key} is a placeholder or missing`, 'Generate real secrets — see the README.');
      } else if ((apiEnv[key] ?? '').length < 24) {
        report('BLOCKER', `${key} is too short`, 'At least 32 random characters.');
      } else {
        report('OK', `${key} is set`);
      }
    }

    /*
      The two apps authenticate to each other with a shared token. A mismatch is not a
      startup error — every page simply renders empty, which is a slow thing to diagnose.
    */
    if (apiEnv.API_SERVICE_TOKEN !== webEnv.API_SERVICE_TOKEN) {
      report(
        'BLOCKER',
        'API_SERVICE_TOKEN differs between the two apps',
        'They must match exactly, or every page renders with no content.',
      );
    } else {
      report('OK', 'API_SERVICE_TOKEN matches across both apps');
    }

    if (apiEnv.REVALIDATE_SECRET !== webEnv.REVALIDATE_SECRET) {
      report(
        'BLOCKER',
        'REVALIDATE_SECRET differs between the two apps',
        'A mismatch means CMS edits never reach the live site.',
      );
    }

    for (const [key, env, label] of [
      ['MONGODB_URI', apiEnv, 'database'],
      ['PUBLIC_SITE_URL', apiEnv, 'canonical URL'],
      ['WEB_ORIGIN', apiEnv, 'web origin'],
      ['API_BASE_URL', webEnv, 'API address'],
      ['NEXT_PUBLIC_SITE_URL', webEnv, 'canonical URL for the web app'],
    ]) {
      const value = env?.[key];
      if (!value) report('BLOCKER', `${key} is not set`, `Required: the ${label}.`);
      else if (/localhost|127\.0\.0\.1/.test(value) && key !== 'API_BASE_URL') {
        report('BLOCKER', `${key} still points at localhost`, value);
      } else report('OK', `${key} = ${value}`);
    }

    if (apiEnv.MEDIA_DRIVER === 'local') {
      report(
        'WARNING',
        'MEDIA_DRIVER=local',
        'Uploads live on this server\'s disk. Fine on a VPS with a persistent volume; on a\n' +
          'container host every upload is lost on the next deploy. Needs ALLOW_LOCAL_MEDIA=true.',
      );
    } else if (apiEnv.MEDIA_DRIVER === 's3') {
      if (!apiEnv.S3_BUCKET) report('BLOCKER', 'MEDIA_DRIVER=s3 but S3_BUCKET is not set');
      else report('OK', `Media on S3 (${apiEnv.S3_BUCKET})`);
    }

    if (apiEnv.EMAIL_DRIVER === 'log') {
      report(
        'WARNING',
        'EMAIL_DRIVER=log',
        'No lead notification or client confirmation will be sent. Leads are still saved.\n' +
          'Needs ALLOW_NO_EMAIL=true to boot.',
      );
    } else if (apiEnv.EMAIL_DRIVER === 'smtp') {
      const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].filter((k) => !apiEnv[k]);
      if (missing.length) report('BLOCKER', `EMAIL_DRIVER=smtp but ${missing.join(', ')} not set`);
      else report('OK', `Email over SMTP (${apiEnv.SMTP_HOST})`);
    } else if (apiEnv.EMAIL_DRIVER === 'ses') {
      report('OK', 'Email over Amazon SES');
    }

    if (apiEnv.TRUST_PROXY !== 'true') {
      report(
        'WARNING',
        'TRUST_PROXY is not true',
        'Behind a load balancer or reverse proxy this makes every visitor look like the proxy,\n' +
          'so rate limiting and lead attribution see one IP for everyone.',
      );
    } else {
      report('OK', 'TRUST_PROXY=true');
    }
  }

  /* ------------------------------------------------------------------ build output */

  console.log('\nBuild');

  const nextBuild = path.join(ROOT, 'apps/web/.next/BUILD_ID');
  const apiBuild = path.join(ROOT, 'apps/api/dist/server.js');
  const sharedBuild = path.join(ROOT, 'packages/shared/dist/index.js');

  report(fs.existsSync(sharedBuild) ? 'OK' : 'BLOCKER', 'packages/shared is built');
  report(fs.existsSync(apiBuild) ? 'OK' : 'BLOCKER', 'apps/api is built');
  report(fs.existsSync(nextBuild) ? 'OK' : 'BLOCKER', 'apps/web is built');

  /* ------------------------------------------------------------------ content */

  console.log('\nContent');

  const uri = apiEnv?.MONGODB_URI;
  if (!uri) {
    report('WARNING', 'Skipping content checks', 'MONGODB_URI is not set, so the database was not read.');
  } else {
    let client;
    try {
      const { MongoClient } = require('mongodb');
      client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000 });
      const db = client.db(apiEnv.MONGODB_DB_NAME || 'aptentech');

      const admins = await db.collection('adminusers').countDocuments();
      if (admins === 0) {
        report('BLOCKER', 'No admin account exists', 'Run: npm run create-admin -- --email you@… --name "…"');
      } else {
        const unchanged = await db.collection('adminusers').countDocuments({ mustChangePassword: true });
        report('OK', `${admins} admin account(s)`);
        if (unchanged > 0) {
          report('WARNING', `${unchanged} admin(s) still on the generated password`, 'They must change it at first sign-in.');
        }
      }

      const pages = await db.collection('sitepages').countDocuments();
      const services = await db.collection('servicepages').countDocuments({ status: 'PUBLISHED' });
      const posts = await db.collection('blogposts').countDocuments({ status: 'PUBLISHED' });
      const media = await db.collection('media').countDocuments();

      if (pages === 0 || services === 0) {
        report('BLOCKER', 'The database has no content', 'Run: npm run seed');
      } else {
        report('OK', `${pages} pages, ${services} service pages, ${posts} articles, ${media} media assets`);
      }

      /*
        Demo content is a blocker rather than a warning.

        These are the values that would be published as claims about the company — a "Demo
        award" in the recognition band, a testimonial attributed to "Demo Client 01", a
        case-study metric nobody verified. They are fine on a staging site and are not fine on
        a live one, and the whole point of seeding them clearly was so this check could find
        them again.
      */
      const demoCaseStudies = await db.collection('casestudies').countDocuments({ demoContent: true });
      const demoTestimonials = await db.collection('testimonials').countDocuments({ demoContent: true });

      if (demoTestimonials > 0) {
        report(
          'BLOCKER',
          `${demoTestimonials} testimonials are still demo content`,
          'They name "Demo Client NN" and quote words no client said. Replace or hide them.',
        );
      }

      if (demoCaseStudies > 0) {
        report(
          'BLOCKER',
          `${demoCaseStudies} case studies still carry demo metrics`,
          'The figures were generated, not measured. Replace them or unpublish the studies.',
        );
      }

      const settings = await db.collection('sitesettings').findOne({ singleton: 'site' });
      const contact = [
        ['email', settings?.email],
        ['phone', settings?.phone],
      ];
      for (const [label, value] of contact) {
        if (!isReal(value) || /^\+00/.test(String(value ?? ''))) {
          report('BLOCKER', `Company ${label} is still a demo value`, `Currently "${value ?? ''}" — set it in Settings.`);
        } else {
          report('OK', `Company ${label} is set`);
        }
      }

      const demoAwards = await db.collection('servicepages').countDocuments({ 'awards.title': /^Demo /i });
      if (demoAwards > 0) {
        report(
          'BLOCKER',
          `${demoAwards} pages show "Demo award" / "Demo certification"`,
          'Fill in real credentials, or switch the recognition section off on those pages.',
        );
      }
    } catch (err) {
      report('WARNING', 'Could not read the database', err instanceof Error ? err.message : String(err));
    } finally {
      await client?.close();
    }
  }

  /* ------------------------------------------------------------------ summary */

  console.log('\n' + '─'.repeat(70));
  if (blockers === 0 && warnings === 0) {
    console.log('Ready to deploy.');
  } else {
    console.log(`${blockers} blocker(s), ${warnings} warning(s).`);
    if (blockers > 0) console.log('Fix the blockers before deploying.');
    else console.log('No blockers. Confirm the warnings are deliberate, then deploy.');
  }

  process.exitCode = blockers > 0 ? 1 : 0;
})();
