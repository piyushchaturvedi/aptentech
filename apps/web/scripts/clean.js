#!/usr/bin/env node
/**
 * Removes the build output before `next build` writes a new one.
 *
 * `next dev` and `next build` share the `.next` directory but fill it differently. A build
 * started while a dev server is running — or straight after one was stopped — reads the
 * half-written leftovers and fails part way through with `Cannot find module for page: /…`,
 * which points at a page that is perfectly fine and sends you looking in the wrong place.
 * Starting from an empty directory costs a few seconds and removes the whole class of
 * failure.
 *
 * This does not make it safe to build *while* a dev server is running: that server would
 * carry on writing into the directory this just emptied. Stop it first with `npm run stop`.
 */

const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', '.next');

try {
  fs.rmSync(target, { recursive: true, force: true });
} catch (err) {
  // A locked file usually means something is still running out of this directory. Say so,
  // rather than letting the build fail later with a misleading missing-page error.
  console.error(
    `\n  Could not clear ${target}\n` +
      `  ${err instanceof Error ? err.message : String(err)}\n\n` +
      '  A dev server is probably still running. Stop it with `npm run stop` and try again.\n',
  );
  process.exit(1);
}
