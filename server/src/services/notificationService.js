// ---------------------------------------------------------------------------
// Notifications (spec section 14).
// A notification is created only when an analysis crosses the user's configured
// threshold, so the inbox does not drown in noise.
// ---------------------------------------------------------------------------
import prisma from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';

export const getPreferences = async (userId) => {
  const existing = await prisma.preference.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.preference.create({ data: { userId } });
};

/** Creates a notification for an analysis if it clears the user's threshold. */
export const notifyIfImportant = async (userId, email, summary) => {
  const preference = await getPreferences(userId);
  if (!preference.notificationEnabled) return null;

  const isRisky = ['HIGH', 'CRITICAL'].includes(summary.riskLevel);
  const isImportant = summary.importanceScore >= preference.notifiedImportanceMin;
  const needsAction = summary.actionItems?.some((item) => !item.completed);
  if (!isRisky && !isImportant && !needsAction) return null;

  const existing = await prisma.notification.findFirst({ where: { userId, emailId: email.id } });
  if (existing) return existing;

  const title = isRisky
    ? `Security warning: ${email.subject.slice(0, 80)}`
    : `Important email from ${email.senderName || email.sender}`;

  return prisma.notification.create({
    data: {
      userId,
      emailId: email.id,
      title,
      body: summary.summary.slice(0, 500),
      priority: summary.priority,
      riskLevel: summary.riskLevel,
    },
  });
};

export const listNotifications = async (userId, { unreadOnly = false, limit = 20 } = {}) =>
  prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(limit) || 20, 100),
    include: { user: { select: { id: true } } },
  });

export const markNotificationRead = async (userId, id, isRead = true) => {
  const found = await prisma.notification.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Notification not found');
  return prisma.notification.update({ where: { id }, data: { isRead } });
};

export const markAllRead = async (userId) =>
  prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });

export const unreadCount = (userId) => prisma.notification.count({ where: { userId, isRead: false } });

export default { notifyIfImportant, listNotifications, markNotificationRead, markAllRead, unreadCount, getPreferences };
