// Session handling.
// - `ams_session` : signed JWT in an httpOnly cookie (never readable by JS)
// - `ams_csrf`    : random value readable by JS, echoed in the X-CSRF-Token
//                   header (double-submit cookie pattern -> CSRF protection)
// - `ams_oauth_state`: short-lived value guarding the OAuth round trip
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'ams_session';
export const CSRF_COOKIE = 'ams_csrf';
export const OAUTH_STATE_COOKIE = 'ams_oauth_state';

const baseCookie = {
  sameSite: 'lax', // blocks cross-site POSTs from third parties
  secure: env.COOKIE_SECURE,
  path: '/',
};

export const signSession = (user) =>
  jwt.sign({ sub: user.id, email: user.email }, env.SESSION_SECRET, {
    expiresIn: Math.floor(env.SESSION_TTL_MS / 1000),
  });

export const verifySession = (token) => {
  try {
    return jwt.verify(token, env.SESSION_SECRET);
  } catch {
    return null;
  }
};

export const setSessionCookies = (res, user) => {
  res.cookie(SESSION_COOKIE, signSession(user), { ...baseCookie, httpOnly: true, maxAge: env.SESSION_TTL_MS });
  res.cookie(CSRF_COOKIE, crypto.randomBytes(24).toString('hex'), {
    ...baseCookie,
    httpOnly: false,
    maxAge: env.SESSION_TTL_MS,
  });
};

export const clearSessionCookies = (res) => {
  res.clearCookie(SESSION_COOKIE, { ...baseCookie, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseCookie, httpOnly: false });
};

export const issueOAuthState = (res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, { ...baseCookie, httpOnly: true, maxAge: 10 * 60 * 1000 });
  return state;
};

export const readOAuthState = (req) => req.cookies?.[OAUTH_STATE_COOKIE];

export const consumeOAuthState = (req, res) => {
  const value = readOAuthState(req);
  res.clearCookie(OAUTH_STATE_COOKIE, { ...baseCookie, httpOnly: true });
  return value;
};
