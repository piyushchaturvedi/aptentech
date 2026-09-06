#!/usr/bin/env node
/**
 * Checks the production database is reachable and correctly shaped.
 *
 * Read-only by design, with one exception: it seeds content when the database is completely
 * empty. That is a first-deploy convenience, not something a redeploy repeats — reseeding on
 * every deployment would overwrite whatever an editor had changed in the CMS since.
 *
 * It never drops, deletes or replaces anything.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

(async () => {
  const uri = envValue('MONGODB_URI');
  const dbName = envValue('MONGODB_DB_NAME') || 'aptentech';

  if (!uri) {
    console.error('     ✗ MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  let client;

  try {
    client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  } catch (err) {
    // The message can contain the URI, and the URI contains the password.
    console.error('     ✗ Could not connect to MongoDB.');
    console.error('       Check the host, the database user, and that this server\'s IP is allowed.');
    process.exit(1);
  }

  const db = client.db(dbName);

  const counts = {
    pages: await db.collection('sitepages').countDocuments(),
    services: await db.collection('servicepages').countDocuments(),
    posts: await db.collection('blogposts').countDocuments(),
    admins: await db.collection('adminusers').countDocuments(),
    leads: await db.collection('leads').countDocuments(),
  };

  console.log(`     ✓ connected to "${dbName}"`);

  const empty = counts.pages === 0 && counts.services === 0;

  if (empty) {
    console.log('     ! database is empty — seeding content (first deploy only)');
    await client.close();

    // The seed reads the original HTML; it is idempotent and upserts rather than replacing.
    const sourceDir = process.env.SOURCE_HTML_DIR || path.resolve(ROOT, '..');
    try {
      execFileSync('npm', ['run', 'seed'], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, SOURCE_HTML_DIR: sourceDir },
        shell: process.platform === 'win32',
      });
    } catch {
      console.error('     ✗ Seeding failed. The original HTML files must be at:');
      console.error(`       ${sourceDir}`);
      console.error('       Set SOURCE_HTML_DIR if they are somewhere else.');
      process.exit(1);
    }
    console.log('     ✓ content seeded');
    return;
  }

  console.log(
    `     ✓ ${counts.pages} pages · ${counts.services} service pages · ` +
      `${counts.posts} articles · ${counts.leads} leads — left untouched`,
  );

  if (counts.admins === 0) {
    console.log('     ! no admin account yet:');
    console.log('       npm run create-admin -- --email you@example.com --name "Your Name" --role SUPER_ADMIN');
  }

  await client.close();
})();
