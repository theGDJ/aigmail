// ---------------------------------------------------------------------------
// Daily AI email digest (spec section 13).
// Builds a "good morning" summary of yesterday's inbox, cached per calendar
// day in the Digest table, and (optionally) delivers it as a notification when
// the user's configured digest time arrives.
// ---------------------------------------------------------------------------
import prisma from '../lib/prisma.js';
import createLogger from '../lib/logger.js';
import { getPreferences } from './preferenceService.js';

const log = createLogger('digest');

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const buildDigest = async (userId, { date = new Date(), force = false } = {}) => {
  const forDate = startOfDay(date);

  if (!force) {
    const cached = await prisma.digest.findUnique({
      where: { userId_forDate: { userId, forDate } },
    });
    if (cached) return { ...cached.content, cached: true };
  }

  const scope = { account: { userId } };
  // "Yesterday" relative to the digest date; the digest covers the previous
  // calendar day (and the current day so far when building today's digest).
  const windowStart = startOfDay(new Date(forDate.getTime() - 86400000));
  const isToday = forDate.getTime() === startOfDay(new Date()).getTime();
  const to = isToday ? endOfDay(new Date()) : endOfDay(forDate);

  const emails = await prisma.email.findMany({
    where: { ...scope, receivedAt: { gte: windowStart, lte: to } },
    include: { summary: { include: { actionItems: true, deadlines: true } } },
    orderBy: { receivedAt: 'desc' },
    take: 200,
  });

  const analysed = emails.filter((e) => e.summary);
  const byPriority = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const email of analysed) byPriority[email.summary.priority] += 1;

  const priorities = analysed
    .slice()
    .sort((a, b) => {
      const score = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      const diff = score[b.summary.priority] - score[a.summary.priority];
      return diff !== 0 ? diff : b.summary.importanceScore - a.summary.importanceScore;
    })
    .slice(0, 5)
    .map((email) => ({
      emailId: email.id,
      subject: email.subject,
      sender: email.senderName || email.sender,
      priority: email.summary.priority,
      importanceScore: email.summary.importanceScore,
      summary: email.summary.summary,
      nextDeadline:
        email.summary.deadlines
          .map((d) => d.dateText || d.description.slice(0, 40))
          .filter(Boolean)
          .slice(0, 1)[0] || null,
    }));

  const tasksDue = analysed
    .flatMap((email) => email.summary.actionItems.map((item) => ({ item, email })))
    .filter(({ item }) => !item.completed)
    .sort((a, b) => {
      const aTime = a.item.deadline ? new Date(a.item.deadline).getTime() : Infinity;
      const bTime = b.item.deadline ? new Date(b.item.deadline).getTime() : Infinity;
      return aTime - bTime;
    })
    .slice(0, 6)
    .map(({ item, email }) => ({
      task: item.task,
      deadline: item.deadline,
      dueText: item.dueText,
      emailId: email.id,
      subject: email.subject,
    }));

  const risky = analysed
    .filter((e) => ['HIGH', 'CRITICAL'].includes(e.summary.riskLevel))
    .slice(0, 3)
    .map((e) => ({ emailId: e.id, subject: e.subject, riskLevel: e.summary.riskLevel }));

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const content = {
    greeting,
    forDate: forDate.toISOString(),
    window: { from: windowStart.toISOString(), to: new Date(to).toISOString() },
    totals: {
      emails: emails.length,
      analyzed: analysed.length,
      unread: emails.filter((e) => !e.isRead).length,
      urgent: byPriority.URGENT,
      important: analysed.filter((e) => e.summary.importanceScore >= 70).length,
    },
    byPriority,
    priorities,
    tasksDue,
    risky,
    headline:
      emails.length === 0
        ? 'No new email in this window - enjoy the quiet inbox.'
        : `You received ${emails.length} email${emails.length === 1 ? '' : 's'}. ${byPriority.URGENT} urgent, ${byPriority.HIGH} high priority.`,
    generatedAt: new Date().toISOString(),
  };

  await prisma.digest.upsert({
    where: { userId_forDate: { userId, forDate } },
    create: { userId, forDate, content },
    update: { content },
  });

  return { ...content, cached: false };
};

/** Delivers the digest as a notification when its scheduled time has passed. */
export const deliverDueDigests = async () => {
  const preferences = await prisma.preference.findMany({
    where: { digestEnabled: true },
    include: { user: { select: { id: true } } },
  });

  let delivered = 0;
  for (const preference of preferences) {
    try {
      const [hours, minutes] = preference.digestTime.split(':').map(Number);
      const now = new Date();
      const due = new Date();
      due.setHours(hours, minutes, 0, 0);
      if (now < due) continue;

      const forDate = startOfDay(now);
      const digest = await prisma.digest.findUnique({
        where: { userId_forDate: { userId: preference.userId, forDate } },
      });

      const alreadySent = digest?.content?.sentAt;
      const content = digest?.content || (await buildDigest(preference.userId, { date: now }));

      if (alreadySent) continue;

      const notification = await prisma.notification.findFirst({
        where: { userId: preference.userId, title: { startsWith: 'Daily AI digest' }, createdAt: { gte: forDate } },
      });
      if (!notification) {
        await prisma.notification.create({
          data: {
            userId: preference.userId,
            title: `Daily AI digest - ${forDate.toDateString()}`,
            body: `${content.headline}${content.priorities?.length ? ` Top priority: ${content.priorities[0].subject}.` : ''}`,
            priority: content.byPriority?.URGENT ? 'URGENT' : 'MEDIUM',
            riskLevel: 'LOW',
          },
        });
        delivered += 1;
      }

      await prisma.digest.upsert({
        where: { userId_forDate: { userId: preference.userId, forDate } },
        create: { userId: preference.userId, forDate, content: { ...content, sentAt: new Date().toISOString() } },
        update: { content: { ...content, sentAt: new Date().toISOString() } },
      });
    } catch (err) {
      log.warn('Digest delivery failed', { userId: preference.userId, message: err.message });
    }
  }
  return { delivered, checked: preferences.length };
};

export const getDigestPreferences = getPreferences;

export default { buildDigest, deliverDueDigests };
