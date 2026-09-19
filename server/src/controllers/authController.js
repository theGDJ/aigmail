// Auth controllers. Session cookies are httpOnly; the CSRF cookie is readable
// by the client so it can echo it back in the X-CSRF-Token header.
import { env, features } from '../config/env.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { setSessionCookies, clearSessionCookies, issueOAuthState, consumeOAuthState } from '../lib/session.js';
import authService from '../services/authService.js';
import gmailProvider from '../services/providers/gmailProvider.js';
import { getPreferences } from '../services/preferenceService.js';

export const googleLogin = asyncHandler(async (_req, res) => {
  if (!features.googleOAuth) {
    return res.status(503).json({
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message:
          'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env, or use the demo mailbox.',
      },
    });
  }
  const state = issueOAuthState(res);
  return res.redirect(gmailProvider.buildAuthUrl(state));
});

export const googleCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState = consumeOAuthState(req, res);

  if (error) return res.redirect(`${env.CLIENT_ORIGIN}/login?error=${encodeURIComponent(String(error))}`);
  if (!code) throw badRequest('Missing authorization code');
  if (!state || !expectedState || state !== expectedState) {
    return res.redirect(`${env.CLIENT_ORIGIN}/login?error=invalid_state`);
  }

  const { user } = await authService.loginWithGoogle(String(code));
  setSessionCookies(res, user);
  return res.redirect(`${env.CLIENT_ORIGIN}/dashboard?connected=gmail`);
});

export const demoLogin = asyncHandler(async (_req, res) => {
  const { user } = await authService.loginAsDemo();
  setSessionCookies(res, user);
  const preference = await getPreferences(user.id);
  return res.json({ user: authService.serializeUser(user), preference, mode: 'demo' });
});

export const logout = asyncHandler(async (_req, res) => {
  clearSessionCookies(res);
  return res.json({ success: true });
});

export const me = asyncHandler(async (req, res) => {
  const preference = await getPreferences(req.user.id);
  return res.json({
    user: authService.serializeUser(req.user),
    preference,
    accounts: await import('../services/emailService.js').then((m) => m.listAccounts(req.user.id)),
    capabilities: {
      googleOAuth: features.googleOAuth,
      ai: features.openai ? 'openai' : 'local',
    },
  });
});

export const status = asyncHandler(async (_req, res) => res.json(authService.authStatus()));

export default { googleLogin, googleCallback, demoLogin, logout, me, status };
