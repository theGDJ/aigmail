// ---------------------------------------------------------------------------
// Express application assembly.
// Order matters: security headers -> parsers -> CSRF -> rate limit -> routes
// -> 404 -> error handler.
// ---------------------------------------------------------------------------
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes, { authRoutes } from './routes/index.js';
import { csrfProtection, ensureCsrfCookie } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import prisma from './lib/prisma.js';
import digestService from './services/digestService.js';

export const createApp = () => {
  const app = express();

  // Behind a reverse proxy (nginx, Railway, Render) trust the first hop so
  // secure cookies and rate limiting see the real client IP.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: [env.CLIENT_ORIGIN],
      credentials: true, // session cookies
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Health probe (no auth, no rate limit).
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up', env: env.NODE_ENV, time: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'degraded', database: 'down', message: err.message });
    }
  });

  // Browser-facing OAuth endpoints. These live at /auth/* (not under /api)
  // because GOOGLE_OAUTH_REDIRECT_URI is registered with Google as
  // https://<host>/auth/google/callback.
  app.use('/auth', ensureCsrfCookie, csrfProtection, authRoutes);

  // JSON API used by the React client.
  app.use('/api', ensureCsrfCookie, apiLimiter, csrfProtection, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

/** Periodic digest delivery check (runs in-process; swap for a queue later). */
export const startSchedulers = () => {
  const intervalMs = 15 * 60 * 1000;
  const run = () => digestService.deliverDueDigests().catch(() => {});
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
};

export default createApp;
