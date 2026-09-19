// ---------------------------------------------------------------------------
// Authentication service.
// Two entry points:
//   1. Google OAuth 2.0 (real Gmail accounts, offline access for refresh tokens)
//   2. Demo login - a password-free session bound to a seeded mock mailbox so
//      the whole application can be exercised without Google credentials.
// Passwords are never collected: identity always comes from an OAuth provider.
// ---------------------------------------------------------------------------
import prisma from '../lib/prisma.js';
import { env, features } from '../config/env.js';
import { AppError, badRequest } from '../lib/errors.js';
import createLogger from '../lib/logger.js';
import gmailProvider from './providers/gmailProvider.js';

const log = createLogger('auth');

export const DEMO_USER = {
  email: 'demo.user@gmail.com',
  name: 'Demo User',
  profileImage: null,
};

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  profileImage: user.profileImage,
  createdAt: user.createdAt,
  hasGoogle: Boolean(user.googleId),
});

export const serializeUser = publicUser;

/** Creates the standard preference row for a new user. */
const ensurePreference = (userId) =>
  prisma.preference.upsert({ where: { userId }, create: { userId }, update: {} });

/**
 * Handles the Google OAuth callback: upserts the user, stores the Gmail tokens
 * on an EmailAccount and returns the user for session creation.
 */
export const loginWithGoogle = async (code) => {
  const { tokens, profile } = await gmailProvider.exchangeCode(code);
  if (!profile?.email) throw badRequest('Google did not return an email address');

  const user = await prisma.user.upsert({
    where: { email: profile.email.toLowerCase() },
    create: {
      email: profile.email.toLowerCase(),
      name: profile.name || profile.email.split('@')[0],
      profileImage: profile.picture || null,
      googleId: profile.id || null,
    },
    update: {
      name: profile.name || undefined,
      profileImage: profile.picture || undefined,
      googleId: profile.id || undefined,
    },
  });
  await ensurePreference(user.id);

  const account = await prisma.emailAccount.findFirst({
    where: { userId: user.id, provider: 'GMAIL' },
  });

  const tokenData = {
    accessToken: tokens.access_token || null,
    // Google only returns a refresh token on first consent (or with prompt=consent).
    refreshToken: tokens.refresh_token || account?.refreshToken || null,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope || null,
  };

  const emailAccount = account
    ? await prisma.emailAccount.update({ where: { id: account.id }, data: tokenData })
    : await prisma.emailAccount.create({
        data: {
          userId: user.id,
          provider: 'GMAIL',
          email: profile.email.toLowerCase(),
          ...tokenData,
        },
      });

  log.info('Google login', { userId: user.id, accountId: emailAccount.id });
  return { user, account: emailAccount };
};

/** Signs in (or creates) the demo user with a pre-populated mock mailbox. */
export const loginAsDemo = async () => {
  if (!features.demoLogin) {
    throw new AppError('Demo login is disabled on this deployment.', 403, 'DEMO_DISABLED');
  }

  const user = await prisma.user.upsert({
    where: { email: DEMO_USER.email },
    create: DEMO_USER,
    update: { name: DEMO_USER.name },
  });
  await ensurePreference(user.id);

  const account = await prisma.emailAccount.upsert({
    where: { provider_email: { provider: 'MOCK', email: DEMO_USER.email } },
    create: { userId: user.id, provider: 'MOCK', email: DEMO_USER.email },
    update: {},
  });

  log.info('Demo login', { userId: user.id, accountId: account.id });
  return { user, account };
};

export const getUserById = (id) => prisma.user.findUnique({ where: { id } });

export const logout = () => ({ success: true });

export const authStatus = () => ({
  googleOAuthEnabled: features.googleOAuth,
  demoLoginEnabled: features.demoLogin,
  aiProvider: features.openai ? 'openai' : 'local',
  ...(env.isProd ? {} : { clientOrigin: env.CLIENT_ORIGIN }),
});

export default { loginWithGoogle, loginAsDemo, getUserById, serializeUser, logout, authStatus };
