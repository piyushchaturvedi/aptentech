/**
 * Summarises every captured original/migrated signature pair.
 *
 * Captures are written to `.parity/` as `o-<page>.json` (the original, rendered at :8080)
 * and `m-<page>.json` (the migration, rendered at :3000). This walks every pair and prints
 * one line per page, then the detail for any page that does not match, so a single run
 * shows where the migration still diverges from the source.
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '../.parity');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));

const counts = (list) => {
  const map = new Map();
  for (const key of list) map.set(key, (map.get(key) || 0) + 1);
  return map;
};

const pages = fs
  .readdirSync(DIR)
  .filter((f) => f.startsWith('o-') && f.endsWith('.json'))
  .map((f) => f.slice(2, -5))
  .filter((name) => fs.existsSync(path.join(DIR, 'm-' + name + '.json')))
  .sort();

const failures = [];

for (const name of pages) {
  const original = load('o-' + name);
  const migrated = load('m-' + name);

  const a = counts(original);
  const b = counts(migrated);
  const missing = [];
  const extra = [];

  for (const [key, n] of a) {
    const diff = n - (b.get(key) || 0);
    if (diff > 0) missing.push([key, diff, n, b.get(key) || 0]);
  }
  for (const [key, n] of b) {
    const diff = n - (a.get(key) || 0);
    if (diff > 0) extra.push([key, diff, a.get(key) || 0, n]);
  }

  const ok = !missing.length && !extra.length;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} original ${String(original.length).padStart(4)}  migrated ${String(
      migrated.length,
    ).padStart(4)}${ok ? '' : `  (-${missing.reduce((s, m) => s + m[1], 0)} / +${extra.reduce((s, e) => s + e[1], 0)})`}`,
  );

  if (!ok) failures.push({ name, missing, extra });
}

if (failures.length) {
  const only = process.argv[2];
  for (const f of failures) {
    if (only && f.name !== only) continue;
    console.log(`\n──────── ${f.name}`);
    if (f.missing.length) {
      console.log('  MISSING:');
      for (const [key, diff, o, m] of f.missing.sort((x, y) => y[1] - x[1])) {
        console.log(`    -${String(diff).padStart(3)}  ${key}   (original ${o}, migrated ${m})`);
      }
    }
    if (f.extra.length) {
      console.log('  EXTRA:');
      for (const [key, diff, o, m] of f.extra.sort((x, y) => y[1] - x[1])) {
        console.log(`    +${String(diff).padStart(3)}  ${key}   (original ${o}, migrated ${m})`);
      }
    }
  }
}

console.log(`\n${pages.length - failures.length}/${pages.length} pages structurally identical.`);
process.exit(failures.length ? 1 : 0);
