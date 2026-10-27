// Server entry point.
import { createApp, startSchedulers } from './app.js';
import { env, features } from './config/env.js';
import prisma from './lib/prisma.js';
import createLogger from './lib/logger.js';

const log = createLogger('server');

const app = createApp();

const server = app.listen(env.PORT, async () => {
  log.info(`API listening on http://localhost:${env.PORT}`, {
    env: env.NODE_ENV,
    clientOrigin: env.CLIENT_ORIGIN,
    googleOAuth: features.googleOAuth,
    aiProvider: features.ai ? (features.groq ? 'groq' : 'openai') : 'local (deterministic fallback)',
    demoLogin: features.demoLogin,
  });

  if (!features.googleOAuth) {
    log.warn('Google OAuth not configured - Gmail sign-in disabled, demo mailbox available.');
  }
  if (!features.ai) {
    log.warn('AI credentials not set - using the built-in local analysis engine.');
  }

  try {
    await prisma.$runCommandRaw({ ping: 1 });
    log.info('Database connection verified');
  } catch (err) {
    log.error('Database unreachable - check DATABASE_URL', { message: err.message });
  }

  startSchedulers();
});

const shutdown = async (signal) => {
  log.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force-exit if connections linger.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', { reason: String(reason) }));

export default server;
