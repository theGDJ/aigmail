// ---------------------------------------------------------------------------
// Email service - provider access + persistence + querying.
// All queries are scoped by userId so one user can never read another's mail.
// ---------------------------------------------------------------------------
import prisma from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import createLogger from '../lib/logger.js';
import { getProviderForAccount } from './providers/index.js';
import aiService from './ai/aiService.js';

const log = createLogger('email');

const SUMMARY_INCLUDE = {
  summary: {
    include: { actionItems: { orderBy: { createdAt: 'asc' } }, deadlines: { orderBy: { date: 'asc' } } },
  },
};

const userAccountScope = async (userId, accountId) => {
  if (accountId) {
    const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw notFound('Email account not found');
    return [account];
  }
  const accounts = await prisma.emailAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (!accounts.length) throw new AppError('No email account connected yet.', 409, 'NO_ACCOUNT');
  return accounts;
};

/** Ensures a user has at least one usable account (used by the demo login). */
export const ensureMockAccount = async (user) => {
  const existing = await prisma.emailAccount.findFirst({ where: { userId: user.id } });
  if (existing) return existing;
  return prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: 'MOCK',
      email: user.email,
      lastSyncedAt: null,
    },
  });
};

export const listAccounts = (userId) =>
  prisma.emailAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      provider: true,
      email: true,
      lastSyncedAt: true,
      createdAt: true,
      scope: true,
      // tokens deliberately excluded from API responses
    },
  });

export const countEmails = (userId) =>
  prisma.email.count({ where: { account: { userId } } });

// ---------------------------------------------------------------------------
// synchronization
// ---------------------------------------------------------------------------

/**
 * Fetches messages from the provider and upserts them.
 * Existing rows keep their read state and AI summary; new rows are created.
 */
export const syncEmails = async (userId, { accountId, maxResults = 30, query } = {}) => {
  const accounts = await userAccountScope(userId, accountId);
  let created = 0;
  let updated = 0;
  let fetched = 0;

  for (const account of accounts) {
    const provider = getProviderForAccount(account);
    const { messages } = await provider.listMessages(account, { maxResults, query });

    for (const ref of messages) {
      const email = await provider.getMessage(account, ref.externalId);
      fetched += 1;
      const existing = await prisma.email.findUnique({
        where: { accountId_externalId: { accountId: account.id, externalId: email.externalId } },
        select: { id: true },
      });

      await prisma.email.upsert({
        where: { accountId_externalId: { accountId: account.id, externalId: email.externalId } },
        create: { accountId: account.id, ...email },
        update: {
          subject: email.subject,
          body: email.body,
          snippet: email.snippet,
          labels: email.labels,
          isStarred: email.isStarred,
          hasAttachments: email.hasAttachments,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }

    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });

    // Best-effort account metadata refresh.
    try {
      const profile = await provider.getProfile(account);
      if (profile?.email && profile.email !== account.email) {
        await prisma.emailAccount.update({ where: { id: account.id }, data: { email: profile.email } });
      }
    } catch (err) {
      log.debug('Profile refresh skipped', { accountId: account.id, reason: err.message });
    }
  }

  return { fetched, created, updated, accounts: accounts.length };
};

/**
 * Analyzes emails that do not have a summary yet.
 * Bounded on purpose: AI work is expensive, so sync never analyzes everything.
 */
export const analyzeMissingSummaries = async (userId, { limit = 8, summaryLength = 'MEDIUM', language = 'EN' } = {}) => {
  const pending = await prisma.email.findMany({
    where: { account: { userId }, summary: null },
    orderBy: { receivedAt: 'desc' },
    take: Math.min(Number(limit) || 8, 25),
  });

  let analyzed = 0;
  for (const email of pending) {
    try {
      const stored = await aiService.analyzeAndStore(email, { summaryLength, language });
      await maybeNotify(userId, email, stored.summary);
      analyzed += 1;
    } catch (err) {
      log.warn('Analysis failed during sync', { emailId: email.id, message: err.message });
    }
  }
  return { pending: pending.length, analyzed };
};

/**
 * Re-runs analysis for the most recent emails (force = overwrite summaries).
 * Used when the user changes summary length or language.
 */
export const reanalyzeInbox = async (userId, { limit = 25, summaryLength = 'MEDIUM', language = 'EN' } = {}) => {
  const emails = await prisma.email.findMany({
    where: { account: { userId } },
    orderBy: { receivedAt: 'desc' },
    take: Math.min(Number(limit) || 25, 100),
  });

  let analyzed = 0;
  const failures = [];
  for (const email of emails) {
    try {
      const stored = await aiService.analyzeAndStore(email, { summaryLength, language });
      await maybeNotify(userId, email, stored.summary);
      analyzed += 1;
    } catch (err) {
      failures.push({ emailId: email.id, message: err.message });
    }
  }
  return { candidates: emails.length, analyzed, failures: failures.length };
};

// Imported lazily to avoid a circular dependency (notificationService -> emailService).
const maybeNotify = async (userId, email, summary) => {
  const { notifyIfImportant } = await import('./notificationService.js');
  return notifyIfImportant(userId, email, summary);
};

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

const buildWhere = (userId, filters) => {
  const where = { account: { userId } };
  const and = [];

  if (filters.accountId) and.push({ accountId: filters.accountId });
  if (filters.unreadOnly) and.push({ isRead: false });
  if (filters.category) and.push({ summary: { is: { category: filters.category } } });
  if (filters.priority) and.push({ summary: { is: { priority: filters.priority } } });
  if (filters.riskOnly) and.push({ summary: { is: { riskLevel: { in: ['HIGH', 'CRITICAL'] } } } });
  if (filters.actionRequired) {
    and.push({ summary: { is: { actionItems: { some: { completed: false } } } } });
  }
  if (filters.importantOnly) and.push({ summary: { is: { importanceScore: { gte: 70 } } } });
  if (filters.analyzed === true) and.push({ summary: { isNot: null } });
  if (filters.analyzed === false) and.push({ summary: { is: null } });
  if (filters.from) and.push({ sender: { contains: filters.from, mode: 'insensitive' } });
  if (filters.since) and.push({ receivedAt: { gte: new Date(filters.since) } });
  if (filters.until) and.push({ receivedAt: { lte: new Date(filters.until) } });
  if (filters.q) {
    and.push({
      OR: [
        { subject: { contains: filters.q, mode: 'insensitive' } },
        { sender: { contains: filters.q, mode: 'insensitive' } },
        { senderName: { contains: filters.q, mode: 'insensitive' } },
        { body: { contains: filters.q, mode: 'insensitive' } },
      ],
    });
  }

  return and.length ? { ...where, AND: and } : where;
};

const SORTS = {
  newest: [{ receivedAt: 'desc' }],
  oldest: [{ receivedAt: 'asc' }],
  unread: [{ isRead: 'asc' }, { receivedAt: 'desc' }],
};

export const listEmails = async (userId, filters = {}) => {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const where = buildWhere(userId, filters);

  const [total, items] = await Promise.all([
    prisma.email.count({ where }),
    prisma.email.findMany({
      where,
      orderBy: SORTS[filters.sort] || SORTS.newest,
      skip: (page - 1) * limit,
      take: limit,
      include: SUMMARY_INCLUDE,
    }),
  ]);

  return {
    items: items.map(serializeEmail),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const getEmail = async (userId, id) => {
  const email = await prisma.email.findFirst({
    where: { id, account: { userId } },
    include: { ...SUMMARY_INCLUDE, account: { select: { id: true, provider: true, email: true } } },
  });
  if (!email) throw notFound('Email not found');
  return serializeEmail(email, { includeBody: true, includeAccount: true });
};

export const serializeEmail = (email, { includeBody = false, includeAccount = false } = {}) => ({
  id: email.id,
  externalId: email.externalId,
  threadId: email.threadId,
  sender: email.sender,
  senderName: email.senderName,
  recipient: email.recipient,
  subject: email.subject,
  snippet: email.snippet,
  receivedAt: email.receivedAt,
  isRead: email.isRead,
  isStarred: email.isStarred,
  hasAttachments: email.hasAttachments,
  labels: email.labels,
  ...(includeBody ? { body: email.body } : {}),
  // Only non-sensitive account fields may cross the API boundary: OAuth access
  // and refresh tokens must never reach the browser.
  ...(includeAccount && email.account
    ? {
        account: {
          id: email.account.id,
          provider: email.account.provider,
          email: email.account.email,
        },
      }
    : {}),
  summary: email.summary
    ? {
        id: email.summary.id,
        summary: email.summary.summary,
        keyPoints: email.summary.keyPoints,
        priority: email.summary.priority,
        category: email.summary.category,
        importanceScore: email.summary.importanceScore,
        importanceReasons: email.summary.importanceReasons,
        requiresReply: email.summary.requiresReply,
        replyRationale: email.summary.replyRationale,
        riskLevel: email.summary.riskLevel,
        riskReasons: email.summary.riskReasons,
        language: email.summary.language,
        engine: email.summary.engine,
        modelUsed: email.summary.modelUsed,
        updatedAt: email.summary.updatedAt,
        actionItems: email.summary.actionItems,
        deadlines: email.summary.deadlines,
      }
    : null,
});

// ---------------------------------------------------------------------------
// mutations
// ---------------------------------------------------------------------------

export const setReadStatus = async (userId, id, isRead) => {
  const email = await prisma.email.findFirst({
    where: { id, account: { userId } },
    include: { account: true },
  });
  if (!email) throw notFound('Email not found');

  const provider = getProviderForAccount(email.account);
  try {
    await provider.setRead(email.account, email.externalId, isRead);
  } catch (err) {
    // Remote failure should not silently change local state; surface it.
    log.warn('Remote read-state update failed', { emailId: id, message: err.message });
    throw err;
  }

  return prisma.email.update({ where: { id }, data: { isRead } });
};

export const bulkSetRead = async (userId, ids, isRead) => {
  const results = { updated: 0, failed: 0 };
  for (const id of ids) {
    try {
      await setReadStatus(userId, id, isRead);
      results.updated += 1;
    } catch {
      results.failed += 1;
    }
  }
  return results;
};

/** Sends a (user-confirmed) reply through the connected provider. */
export const sendReply = async (userId, emailId, { body, subject, to }) => {
  if (!body || !String(body).trim()) throw new AppError('Reply body cannot be empty', 400, 'EMPTY_REPLY');

  const email = await prisma.email.findFirst({
    where: { id: emailId, account: { userId } },
    include: { account: true },
  });
  if (!email) throw notFound('Email not found');

  const provider = getProviderForAccount(email.account);
  const result = await provider.sendMessage(email.account, {
    to: to || email.sender,
    subject: subject || (email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`),
    body,
    threadId: email.threadId || undefined,
  });

  log.info('Reply sent', { emailId, provider: provider.id, simulated: Boolean(result?.simulated) });
  return { ...result, provider: provider.id };
};

export const deleteEmail = async (userId, id) => {
  const email = await prisma.email.findFirst({ where: { id, account: { userId } }, select: { id: true } });
  if (!email) throw notFound('Email not found');
  await prisma.email.delete({ where: { id } });
  return { deleted: true };
};

export default {
  syncEmails,
  analyzeMissingSummaries,
  reanalyzeInbox,
  listEmails,
  serializeEmail,
  getEmail,
  setReadStatus,
  bulkSetRead,
  sendReply,
  deleteEmail,
  listAccounts,
  ensureMockAccount,
  countEmails,
};
