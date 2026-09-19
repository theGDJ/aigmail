// Remaining controllers: tasks, analytics, preferences, digest, notifications.
import { asyncHandler } from '../lib/errors.js';
import taskService from '../services/taskService.js';
import analyticsService from '../services/analyticsService.js';
import { getPreferences, updatePreferences } from '../services/preferenceService.js';
import digestService from '../services/digestService.js';
import notificationService from '../services/notificationService.js';

// --- tasks -----------------------------------------------------------------
export const listTasks = asyncHandler(async (req, res) => {
  const { completed, dueBefore, priority, limit } = req.query;
  const tasks = await taskService.listTasks(req.user.id, {
    completed: completed === undefined ? undefined : completed === 'true' || completed === true,
    dueBefore,
    priority,
    limit,
  });
  res.json({ tasks, stats: await taskService.taskStats(req.user.id) });
});

export const updateTask = asyncHandler(async (req, res) => {
  res.json({ task: await taskService.updateTask(req.user.id, req.params.id, req.body) });
});

// --- analytics -------------------------------------------------------------
export const analytics = asyncHandler(async (req, res) => {
  res.json(await analyticsService.getAnalytics(req.user.id, { days: Number(req.query.days) || 14 }));
});

// --- preferences -----------------------------------------------------------
export const readPreferences = asyncHandler(async (req, res) => {
  res.json({ preference: await getPreferences(req.user.id) });
});

export const writePreferences = asyncHandler(async (req, res) => {
  const preference = await updatePreferences(req.user.id, req.body);
  res.json({ preference });
});

// --- digest ----------------------------------------------------------------
export const digest = asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();
  const force = String(req.query.refresh || '') === 'true';
  res.json({ digest: await digestService.buildDigest(req.user.id, { date, force }) });
});

// --- notifications ---------------------------------------------------------
export const listNotifications = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  const notifications = await notificationService.listNotifications(req.user.id, {
    unreadOnly,
    limit: Number(req.query.limit) || 20,
  });
  res.json({ notifications, unread: await notificationService.unreadCount(req.user.id) });
});

export const readNotification = asyncHandler(async (req, res) => {
  res.json({
    notification: await notificationService.markNotificationRead(req.user.id, req.params.id, req.body?.isRead ?? true),
  });
});

export const readAllNotifications = asyncHandler(async (req, res) => {
  res.json(await notificationService.markAllRead(req.user.id));
});

export default {
  listTasks,
  updateTask,
  analytics,
  readPreferences,
  writePreferences,
  digest,
  listNotifications,
  readNotification,
  readAllNotifications,
};
