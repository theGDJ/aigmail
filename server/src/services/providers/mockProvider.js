// ---------------------------------------------------------------------------
// Mock provider - same interface as gmailProvider, backed by seeded templates.
//
// Purpose: the whole application (sync, parsing, AI, analytics, digest) can be
// demonstrated and tested without Google credentials. Read state is owned by
// PostgreSQL (Email.isRead), so setRead is a no-op that just confirms success.
// ---------------------------------------------------------------------------
import { AppError } from '../../lib/errors.js';
import { cleanEmailBody } from '../emailParser.js';
import { buildMockEmails } from './mockData.js';

const mailbox = () => buildMockEmails(new Date());

export const getProfile = async (account) => ({ email: account?.email || 'demo.user@gmail.com' });

export const listMessages = async (_account, { maxResults = 25, pageToken } = {}) => {
  const all = mailbox();
  const start = Number(pageToken || 0) || 0;
  const size = Math.min(Number(maxResults) || 25, 100);
  const slice = all.slice(start, start + size);
  return {
    messages: slice.map((m) => ({ externalId: m.externalId, threadId: m.threadId })),
    nextPageToken: start + size < all.length ? String(start + size) : null,
    resultSizeEstimate: all.length,
  };
};

export const getMessage = async (_account, externalId) => {
  const found = mailbox().find((m) => m.externalId === externalId);
  if (!found) throw new AppError(`Mock message ${externalId} not found`, 404, 'NOT_FOUND');
  // Run the real cleaning pipeline so demo data exercises the parser too.
  return { ...found, body: cleanEmailBody(found.body) };
};

// Mock mail cannot be modified remotely; the database is the source of truth.
export const setRead = async () => true;

// "Sending" in demo mode only records the action and returns a fake id.
export const sendMessage = async (_account, { to, subject }) => ({
  externalId: `mock-sent-${Date.now()}`,
  threadId: `mock-thread-${Date.now()}`,
  simulated: true,
  to,
  subject,
});

export default { id: 'mock', getProfile, listMessages, getMessage, setRead, sendMessage };
