import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { syncIndexes } from './models';
import { env } from './config/env';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDb();
  // Index creation runs at boot so a bad index definition fails loudly here rather than
  // silently degrading a query into a collection scan in production.
  await syncIndexes();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, media: env.MEDIA_DRIVER },
      `AptenTech API listening on http://localhost:${env.PORT}`,
    );
  });

  /*
    Outlive the caller's idle sockets.

    Node closes a keep-alive connection after five seconds. The Next.js server pools its
    sockets and reuses them, so one that has been idle a little longer gets picked up just as
    the API is closing it, and the request dies with `ECONNRESET` — a 500 on a page that
    works when you reload it. Holding connections open for longer than any client will keep
    them means the client is always the side that closes.

    `headersTimeout` has to stay above `keepAliveTimeout` or the race simply moves.
  */
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    // Do not let a hung connection hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
