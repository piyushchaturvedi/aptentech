/**
 * PM2 process definitions.
 *
 * Two processes rather than one, so each restarts on its own and each keeps its own log —
 * `pm2 logs aptentech-api` shows the API alone. A single process running both would lose both.
 *
 * `cwd` is set per app because each reads its own `.env` from its own directory: the API from
 * `apps/api/.env`, the web app from `apps/web/.env.local`.
 */
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/*
  A modest memory ceiling on purpose.

  This runs on a t3.micro with 1 GB. A leak that would otherwise fill memory and get the whole
  instance OOM-killed instead restarts one process, and the site stays up.
*/
const MAX_MEMORY = '400M';

module.exports = {
  apps: [
    {
      name: 'aptentech-api',
      cwd: path.join(ROOT, 'apps/api'),
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: MAX_MEMORY,
      autorestart: true,
      // Back off rather than hammering a database that is refusing connections.
      restart_delay: 4000,
      max_restarts: 10,
      merge_logs: true,
      time: true,
    },
    {
      name: 'aptentech-web',
      cwd: path.join(ROOT, 'apps/web'),
      // `next start` directly rather than through npm, so PM2 supervises the server itself
      // and not a shell that spawned it — otherwise a restart can leave the real process behind.
      script: path.join(ROOT, 'node_modules/next/dist/bin/next'),
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: MAX_MEMORY,
      autorestart: true,
      restart_delay: 4000,
      max_restarts: 10,
      merge_logs: true,
      time: true,
    },
  ],
};
