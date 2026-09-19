// CSRF protection (double-submit cookie).
// Safe methods pass through; state-changing methods must echo the value of the
// non-httpOnly `ams_csrf` cookie in the `X-CSRF-Token` header.
import crypto from 'node:crypto';
import { CSRF_COOKIE } from '../lib/session.js';
import { env } from '../config/env.js';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Issues the CSRF cookie on first contact so the very first mutation (e.g. the
 * demo login POST) has a token to echo back. The cookie is intentionally
 * readable by JavaScript - that is what makes the double-submit check work.
 */
export const ensureCsrfCookie = (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, crypto.randomBytes(24).toString('hex'), {
      sameSite: 'lax',
      secure: env.COOKIE_SECURE,
      httpOnly: false,
      path: '/',
      maxAge: env.SESSION_TTL_MS,
    });
  }
  next();
};

const timingSafeEqual = (a = '', b = '') => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const csrfProtection = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  // The OAuth callback is a top-level browser navigation, not a fetch call.
  if (req.path.startsWith('/auth/google/callback')) return next();

  const cookieValue = req.cookies?.[CSRF_COOKIE];
  const headerValue = req.get('x-csrf-token');
  if (!cookieValue || !headerValue || !timingSafeEqual(cookieValue, headerValue)) {
    return next(forbidden('Invalid or missing CSRF token'));
  }
  next();
};

export default csrfProtection;
