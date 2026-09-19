// ---------------------------------------------------------------------------
// Gmail provider (Gmail API v1 through googleapis)
//
// Implements the same interface as the mock provider:
//   listMessages(account, opts) -> { messages, nextPageToken }
//   getMessage(account, externalId) -> normalized email
//   setRead(account, externalId, isRead)
//   sendMessage(account, { to, subject, body, threadId, inReplyTo })
//   getProfile(account) -> { email }
//
// OAuth tokens are refreshed transparently and persisted back to PostgreSQL,
// so a rotated access token survives process restarts.
// ---------------------------------------------------------------------------
import { google } from 'googleapis';
import { env, features } from '../../config/env.js';
import { GMAIL_SCOPES } from '../../config/constants.js';
import { AppError, upstream } from '../../lib/errors.js';
import prisma from '../../lib/prisma.js';
import createLogger from '../../lib/logger.js';
import { parseGmailMessage } from '../emailParser.js';

const log = createLogger('gmail');

export const createOAuthClient = () =>
  new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_OAUTH_REDIRECT_URI);

export const buildAuthUrl = (state) => {
  if (!features.googleOAuth) {
    throw new AppError(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env',
      503,
      'PROVIDER_NOT_CONFIGURED',
    );
  }
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // guarantees a refresh token on repeat sign-ins
    scope: GMAIL_SCOPES,
    state,
  });
};

export const exchangeCode = async (code) => {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return { tokens, profile: data };
};

/** Returns an authorized client, refreshing + persisting tokens when needed. */
const authorizedClient = async (account) => {
  if (!features.googleOAuth) {
    throw new AppError(
      'Google credentials are missing - reconnect the account or use the demo mailbox.',
      503,
      'PROVIDER_NOT_CONFIGURED',
    );
  }
  if (!account?.refreshToken && !account?.accessToken) {
    throw new AppError('This email account has no stored Google tokens.', 409, 'RECONNECT_REQUIRED');
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: account.accessToken || undefined,
    refresh_token: account.refreshToken || undefined,
    expiry_date: account.tokenExpiry ? account.tokenExpiry.getTime() : undefined,
  });

  // Refresh a little before expiry to avoid mid-request failures.
  const expiresSoon = !account.tokenExpiry || account.tokenExpiry.getTime() - Date.now() < 60_000;
  if (account.refreshToken && expiresSoon) {
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          accessToken: credentials.access_token || account.accessToken,
          tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        },
      });
    } catch (err) {
      log.warn('Token refresh failed', { accountId: account.id, error: err.message });
      throw new AppError(
        'Your Google session expired. Please sign in again to reconnect Gmail.',
        401,
        'RECONNECT_REQUIRED',
      );
    }
  }
  return client;
};

const gmailFor = async (account) => google.gmail({ version: 'v1', auth: await authorizedClient(account) });

const wrap = (err, action) => {
  const status = err?.response?.status || err?.code;
  const message = err?.response?.data?.error?.message || err.message;
  if (status === 401 || status === 403) {
    return new AppError(`Gmail rejected the request (${action}): ${message}`, 401, 'RECONNECT_REQUIRED');
  }
  if (status === 429) return new AppError('Gmail rate limit reached, try again shortly.', 429, 'RATE_LIMITED');
  return upstream(`Gmail ${action} failed: ${message}`);
};

export const getProfile = async (account) => {
  try {
    const gmail = await gmailFor(account);
    const { data } = await gmail.users.getProfile({ userId: 'me' });
    return { email: data.emailAddress, historyId: data.historyId };
  } catch (err) {
    throw wrap(err, 'profile');
  }
};

export const listMessages = async (account, { maxResults = 25, pageToken, query } = {}) => {
  try {
    const gmail = await gmailFor(account);
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: Math.min(Number(maxResults) || 25, 100),
      pageToken: pageToken || undefined,
      q: query || undefined,
    });
    return {
      messages: (data.messages || []).map((m) => ({ externalId: m.id, threadId: m.threadId })),
      nextPageToken: data.nextPageToken || null,
      resultSizeEstimate: data.resultSizeEstimate || 0,
    };
  } catch (err) {
    throw wrap(err, 'list');
  }
};

export const getMessage = async (account, externalId) => {
  try {
    const gmail = await gmailFor(account);
    const { data } = await gmail.users.messages.get({ userId: 'me', id: externalId, format: 'full' });
    return parseGmailMessage(data);
  } catch (err) {
    throw wrap(err, 'get');
  }
};

export const setRead = async (account, externalId, isRead) => {
  try {
    const gmail = await gmailFor(account);
    await gmail.users.messages.modify({
      userId: 'me',
      id: externalId,
      requestBody: isRead ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] },
    });
    return true;
  } catch (err) {
    throw wrap(err, 'modify');
  }
};

export const sendMessage = async (account, { to, subject, body, threadId, inReplyTo }) => {
  try {
    const gmail = await gmailFor(account);
    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    ];
    const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const { data } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, ...(threadId ? { threadId } : {}) },
    });
    return { externalId: data.id, threadId: data.threadId };
  } catch (err) {
    throw wrap(err, 'send');
  }
};

export default { id: 'gmail', buildAuthUrl, exchangeCode, getProfile, listMessages, getMessage, setRead, sendMessage };
