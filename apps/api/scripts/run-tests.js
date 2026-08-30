/**
 * Test runner.
 *
 * Node's `--test` directory discovery does not pick up `.ts` files here, and shell glob
 * expansion differs between platforms — `src/**\/*.test.ts` is passed through literally on
 * Windows. Walking the tree ourselves keeps `npm test` working the same way everywhere.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../src');

function findTests(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(full));
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = findTests(root);

if (files.length === 0) {
  console.log('No test files found under src/.');
  process.exit(0);
}

console.log(`Running ${files.length} test file${files.length === 1 ? '' : 's'}:`);
for (const f of files) console.log('  ' + path.relative(root, f));
console.log('');

const result = spawnSync('npx', ['tsx', '--test', ...files], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
