// ---------------------------------------------------------------------------
// Analytics (spec section 12).
// Aggregations run in PostgreSQL where possible; the per-day series is bucketed
// in JS because it needs timezone-correct day boundaries.
// ---------------------------------------------------------------------------
import prisma from '../lib/prisma.js';
import { CATEGORIES, PRIORITIES } from '../config/constants.js';

const dayKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getAnalytics = async (userId, { days = 14 } = {}) => {
  const scope = { account: { userId } };
  const windowStart = new Date(Date.now() - (Number(days) || 14) * 86400000);

  const [
    total,
    unread,
    starred,
    withAttachments,
    analyzed,
    important,
    urgent,
    actionRequired,
    risky,
    byCategoryRows,
    byPriorityRows,
    recentEmails,
    openTasks,
    topSenderRows,
    upcomingDeadlines,
    avgImportance,
  ] = await Promise.all([
    prisma.email.count({ where: scope }),
    prisma.email.count({ where: { ...scope, isRead: false } }),
    prisma.email.count({ where: { ...scope, isStarred: true } }),
    prisma.email.count({ where: { ...scope, hasAttachments: true } }),
    prisma.email.count({ where: { ...scope, summary: { isNot: null } } }),
    prisma.email.count({ where: { ...scope, summary: { is: { importanceScore: { gte: 70 } } } } }),
    prisma.email.count({ where: { ...scope, summary: { is: { priority: 'URGENT' } } } }),
    prisma.email.count({ where: { ...scope, summary: { is: { actionItems: { some: { completed: false } } } } } }),
    prisma.email.count({ where: { ...scope, summary: { is: { riskLevel: { in: ['HIGH', 'CRITICAL'] } } } } }),
    prisma.summary.groupBy({ by: ['category'], where: { email: scope }, _count: { _all: true } }),
    prisma.summary.groupBy({ by: ['priority'], where: { email: scope }, _count: { _all: true } }),
    prisma.email.findMany({
      where: { ...scope, receivedAt: { gte: windowStart } },
      select: { receivedAt: true, sender: true, senderName: true },
      orderBy: { receivedAt: 'desc' },
      take: 5000,
    }),
    prisma.actionItem.findMany({
      where: { summary: { email: scope }, completed: false },
      include: { summary: { include: { email: { select: { id: true, subject: true, sender: true, senderName: true, receivedAt: true } } } } },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    }),
    prisma.email.groupBy({
      by: ['sender'],
      where: { ...scope, receivedAt: { gte: windowStart } },
      _count: { _all: true },
      orderBy: { _count: { sender: 'desc' } },
      take: 8,
    }),
    prisma.deadline.findMany({
      where: { summary: { email: scope }, date: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) } },
      include: { summary: { include: { email: { select: { id: true, subject: true, senderName: true, sender: true } } } } },
      orderBy: { date: 'asc' },
      take: 10,
    }),
    prisma.summary.aggregate({ where: { email: scope }, _avg: { importanceScore: true } }),
  ]);

  // Received-per-day series (all requested days, zero-filled).
  const buckets = new Map();
  for (let i = Number(days) - 1; i >= 0; i -= 1) {
    buckets.set(dayKey(new Date(Date.now() - i * 86400000)), 0);
  }
  for (const email of recentEmails) {
    const key = dayKey(email.receivedAt);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }

  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const row of byCategoryRows) categoryCounts[row.category] = row._count._all;

  const priorityCounts = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
  for (const row of byPriorityRows) priorityCounts[row.priority] = row._count._all;

  return {
    totals: {
      emails: total,
      unread,
      starred,
      withAttachments,
      analyzed,
      pendingAnalysis: total - analyzed,
      important,
      urgent,
      actionRequired,
      risky,
      openTasks: openTasks.length,
      averageImportance: Math.round(avgImportance._avg.importanceScore || 0),
    },
    byCategory: categoryCounts,
    byPriority: priorityCounts,
    perDay: [...buckets.entries()].map(([date, count]) => ({ date, count })),
    topSenders: topSenderRows.map((row) => ({ sender: row.sender, count: row._count._all })),
    upcomingDeadlines: upcomingDeadlines.map((deadline) => ({
      id: deadline.id,
      description: deadline.description,
      date: deadline.date,
      dateText: deadline.dateText,
      type: deadline.type,
      emailId: deadline.summary.email.id,
      emailSubject: deadline.summary.email.subject,
      sender: deadline.summary.email.senderName || deadline.summary.email.sender,
    })),
    recentTasks: openTasks.slice(0, 10).map((task) => ({
      id: task.id,
      task: task.task,
      deadline: task.deadline,
      dueText: task.dueText,
      emailId: task.summary.email.id,
      emailSubject: task.summary.email.subject,
      sender: task.summary.email.senderName || task.summary.email.sender,
      receivedAt: task.summary.email.receivedAt,
    })),
    windowDays: Number(days),
  };
};

export default { getAnalytics };
