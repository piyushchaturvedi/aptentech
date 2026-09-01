#!/usr/bin/env node
/**
 * Frees the two ports the platform uses.
 *
 * Both ports are fixed, so a dev server left running from an earlier session — or one whose
 * terminal was closed without stopping it — keeps holding 3000 or 4000. The next `npm run dev`
 * then dies with `EADDRINUSE`, and because `concurrently -k` stops the other half when one
 * fails, the whole command exits and neither app comes up.
 *
 * Finding the process by port rather than by name is deliberate: it stops exactly what is in
 * the way, and reports what it stopped so nothing is killed silently.
 */

const { execFileSync } = require('node:child_process');

const PORTS = [3000, 4000];
const isWindows = process.platform === 'win32';

/** Returns the PIDs listening on `port`, or an empty array. */
function listeners(port) {
  let out = '';

  try {
    out = isWindows
      ? execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' })
      : execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  } catch {
    // `lsof` exits non-zero when nothing matches, and netstat may be unavailable.
    return [];
  }

  if (!isWindows) {
    return [...new Set(out.split(/\s+/).filter(Boolean))];
  }

  const pids = out
    .split(/\r?\n/)
    .filter((line) => /LISTENING/.test(line))
    // Match the port only where it is the local address's port, never inside an IP or a PID.
    .filter((line) => new RegExp(`[:\\.]${port}\\s`).test(line))
    .map((line) => line.trim().split(/\s+/).pop())
    .filter((pid) => pid && pid !== '0');

  return [...new Set(pids)];
}

function stop(pid) {
  try {
    if (isWindows) execFileSync('taskkill', ['/PID', pid, '/F', '/T'], { stdio: 'ignore' });
    else process.kill(Number(pid), 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

let stopped = 0;

for (const port of PORTS) {
  const pids = listeners(port);

  if (pids.length === 0) {
    console.log(`port ${port}  free`);
    continue;
  }

  for (const pid of pids) {
    const ok = stop(pid);
    if (ok) stopped += 1;
    console.log(`port ${port}  ${ok ? 'stopped' : 'could not stop'} PID ${pid}`);
  }
}

console.log(
  stopped > 0
    ? `\nStopped ${stopped} process${stopped === 1 ? '' : 'es'}. \`npm run dev\` can start now.`
    : '\nNothing was running. `npm run dev` can start now.',
);
