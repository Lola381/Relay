import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/client';
import { logger } from './lib/logger';

const server = createApp().listen(env.API_PORT, () => {
  logger.info(`API listening on http://localhost:${env.API_PORT}/api/v1`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(`Port ${env.API_PORT} is already in use. Stop the other process or change API_PORT.`);
  } else {
    logger.fatal({ err }, 'Server failed to start');
  }
  process.exit(1);
});

// Graceful shutdown: stop accepting connections, then release the DB pool.
// (Long-lived SSE streams will be closed here too once the realtime hub exists.)
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  server.closeAllConnections();
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
