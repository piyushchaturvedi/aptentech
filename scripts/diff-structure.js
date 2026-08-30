/**
 * Diffs two captured DOM signatures.
 *
 * Reports which structural elements the original renders that the migration does not, and
 * vice versa, grouped by count so the real gaps stand out from incidental ordering noise.
 *
 *   node scripts/diff-structure.js original-solution migrated-solution
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '../.parity');

function load(name) {
  const file = path.join(DIR, name + '.json');
  if (!fs.existsSync(file)) {
    console.error(`No capture named "${name}". Captured so far: ${fs.readdirSync(DIR).join(', ') || '(none)'}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('Usage: node scripts/diff-structure.js <original-name> <migrated-name>');
  process.exit(1);
}

const original = load(a);
const migrated = load(b);

const tally = (list) => {
  const m = new Map();
  for (const item of list) m.set(item, (m.get(item) ?? 0) + 1);
  return m;
};

const orig = tally(original);
const mig = tally(migrated);

const missing = [];
const extra = [];

for (const [sel, n] of orig) {
  const have = mig.get(sel) ?? 0;
  if (have < n) missing.push([sel, n - have, n, have]);
}
for (const [sel, n] of mig) {
  const had = orig.get(sel) ?? 0;
  if (had < n) extra.push([sel, n - had, had, n]);
}

missing.sort((x, y) => y[1] - x[1]);
extra.sort((x, y) => y[1] - x[1]);

console.log(`original : ${original.length} elements`);
console.log(`migrated : ${migrated.length} elements`);
console.log(`delta    : ${migrated.length - original.length}\n`);

if (missing.length) {
  console.log(`MISSING from the migration (${missing.length} distinct):`);
  for (const [sel, diff, o, m] of missing) console.log(`  -${String(diff).padStart(3)}  ${sel}   (original ${o}, migrated ${m})`);
} else {
  console.log('Nothing missing.');
}

console.log('');

if (extra.length) {
  console.log(`EXTRA in the migration (${extra.length} distinct):`);
  for (const [sel, diff, o, m] of extra) console.log(`  +${String(diff).padStart(3)}  ${sel}   (original ${o}, migrated ${m})`);
} else {
  console.log('Nothing extra.');
}

process.exit(missing.length ? 1 : 0);
