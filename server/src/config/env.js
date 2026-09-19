// Central environment loader.
// Everything the app needs to know about configuration lives here so that no
// module reads process.env directly (and so secrets never leak to the client).
import 'dotenv/config';
import crypto from 'node:crypto';

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const required = (name, value) => {
  if (!value) {
    throw new Error(
      `[config] Missing required environment variable ${name}. ` +
        'Copy server/.env.example to server/.env and fill it in.',
    );
  }
  return value;
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';

export const env = {
  NODE_ENV,
  isProd,
  isTest: NODE_ENV === 'test',
  // PORT <= 0 means "any free port" which would make the API unreachable from
  // the documented client proxy, so it falls back to the default.
  PORT: (() => {
    const parsed = int(process.env.PORT, 4000);
    return parsed > 0 ? parsed : 4000;
  })(),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  DATABASE_URL: required('DATABASE_URL', process.env.DATABASE_URL),

  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    (isProd
      ? required('SESSION_SECRET', process.env.SESSION_SECRET)
      : crypto.createHash('sha256').update('dev-only-insecure-secret').digest('hex')),
  SESSION_TTL_MS: int(process.env.SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000),
  COOKIE_SECURE: bool(process.env.COOKIE_SECURE, isProd),

  GOOGLE_CLIENT_ID: googleClientId,
  GOOGLE_CLIENT_SECRET: googleClientSecret,
  GOOGLE_OAUTH_REDIRECT_URI:
    process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:4000/auth/google/callback',

  OPENAI_API_KEY: openaiApiKey,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  AI_REQUEST_TIMEOUT_MS: int(process.env.AI_REQUEST_TIMEOUT_MS, 45000),

  ENABLE_DEMO_LOGIN: bool(process.env.ENABLE_DEMO_LOGIN, true),
  ENABLE_MOCK_PROVIDER: bool(process.env.ENABLE_MOCK_PROVIDER, true),
};

// Feature flags derived from configuration. The app must behave sensibly when
// credentials are absent: Gmail falls back to the mock provider and AI falls
// back to the deterministic local engine ("demo mode").
export const features = {
  googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  openai: Boolean(env.OPENAI_API_KEY),
  demoLogin: env.ENABLE_DEMO_LOGIN,
  mockProvider: env.ENABLE_MOCK_PROVIDER,
};

export const aiEngine = features.openai ? 'openai' : 'local';

export default env;
