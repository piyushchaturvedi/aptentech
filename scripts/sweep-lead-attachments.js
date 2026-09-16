#!/usr/bin/env node
/**
 * Deletes attachment files that no enquiry claims.
 *
 * The database expires an unclaimed upload after a day — someone attaches a file, changes
 * their mind and closes the tab, and the record goes on its own. The file on disk does not:
 * a TTL index removes documents, not bytes. Without this the volume fills slowly with files
 * nothing points at, and on a public upload endpoint that is the ordinary case rather than
 * an occasional one.
 *
 * The direction is deliberate. It lists what is on disk and removes what the database does
 * not know about — never the reverse. A file recorded but missing is a different problem and
 * deleting the record would destroy the only evidence of it.
 *
 *   node scripts/sweep-lead-attachments.js
 *   node scripts/sweep-lead-attachments.js --apply
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const { MongoClient } = require(path.join(ROOT, 'node_modules/mongodb'));

function env(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/** Every file under the directory, as keys relative to it — the same form the database stores. */
async function walk(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    // Normalised to forward slashes, because the key was written by `path.posix.join` and a
    // sweep run on Windows would otherwise match nothing and offer to delete everything.
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

(async () => {
  const uri = env('MONGODB_URI') || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const dir = path.resolve(ROOT, env('LEAD_UPLOAD_DIR') || './private-uploads');
  if (!fs.existsSync(dir)) {
    console.log(`Nothing to sweep — ${dir} does not exist yet.`);
    return;
  }

  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(env('MONGODB_DB_NAME') || 'aptentech');

  const known = new Set(
    (await db.collection('leadattachments').find({}).project({ storageKey: 1 }).toArray()).map((d) => d.storageKey),
  );
  const onDisk = await walk(dir);
  const orphans = onDisk.filter((key) => !known.has(key));

  console.log(`\n  files on disk        ${onDisk.length}`);
  console.log(`  recorded in database ${known.size}`);
  console.log(`  unreferenced         ${orphans.length}\n`);

  /*
    A disk holding files while the database knows of none is not a cleanup, it is a symptom —
    the wrong database, an empty one, a restore that has not finished. Sweeping then would
    delete every client's attachment, so it stops instead.
  */
  if (onDisk.length > 0 && known.size === 0) {
    console.log('  Refusing to sweep: the database lists no attachments at all, which usually means');
    console.log('  it is the wrong database rather than that every file is an orphan.\n');
    await client.close();
    process.exitCode = 1;
    return;
  }

  if (!orphans.length || !APPLY) {
    if (orphans.length) console.log('  Dry run. Re-run with --apply to delete them.\n');
    await client.close();
    return;
  }

  let removed = 0;
  for (const key of orphans) {
    const target = path.resolve(dir, key);
    // The keys come from this machine's own filesystem, but a resolve check costs nothing
    // and is what keeps a bad key from reaching outside the directory being swept.
    if (target !== dir && !target.startsWith(dir + path.sep)) continue;
    await fsp.rm(target, { force: true });
    removed += 1;
  }

  console.log(`  ${removed} file(s) deleted.\n`);
  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
