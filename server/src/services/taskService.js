// ---------------------------------------------------------------------------
// Tasks (action items extracted by the AI).
// ---------------------------------------------------------------------------
import prisma from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';

const serialize = (task) => ({
  id: task.id,
  task: task.task,
  deadline: task.deadline,
  dueText: task.dueText,
  completed: task.completed,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  priority: task.summary?.priority,
  category: task.summary?.category,
  email: task.summary?.email
    ? {
        id: task.summary.email.id,
        subject: task.summary.email.subject,
        sender: task.summary.email.sender,
        senderName: task.summary.email.senderName,
        receivedAt: task.summary.email.receivedAt,
      }
    : undefined,
});

export const listTasks = async (userId, { completed, dueBefore, priority, limit = 100 } = {}) => {
  const where = {
    summary: { email: { account: { userId } } },
  };
  if (completed !== undefined) where.completed = completed;
  if (dueBefore) where.deadline = { lte: new Date(dueBefore) };
  if (priority) where.summary = { ...where.summary, priority };

  const tasks = await prisma.actionItem.findMany({
    where,
    include: {
      summary: {
        select: {
          priority: true,
          category: true,
          email: {
            select: { id: true, subject: true, sender: true, senderName: true, receivedAt: true },
          },
        },
      },
    },
    orderBy: [{ completed: 'asc' }, { deadline: 'asc' }, { createdAt: 'desc' }],
    take: Math.min(Number(limit) || 100, 200),
  });

  return tasks.map(serialize);
};

export const updateTask = async (userId, id, patch) => {
  const existing = await prisma.actionItem.findFirst({
    where: { id, summary: { email: { account: { userId } } } },
  });
  if (!existing) throw notFound('Task not found');

  const data = {};
  if (patch.completed !== undefined) data.completed = Boolean(patch.completed);
  if (patch.task !== undefined) data.task = String(patch.task).slice(0, 400);
  if (patch.deadline !== undefined) data.deadline = patch.deadline ? new Date(patch.deadline) : null;

  const updated = await prisma.actionItem.update({ where: { id }, data });
  return serialize(updated);
};

export const taskStats = async (userId) => {
  const [open, done, overdue] = await Promise.all([
    prisma.actionItem.count({ where: { completed: false, summary: { email: { account: { userId } } } } }),
    prisma.actionItem.count({ where: { completed: true, summary: { email: { account: { userId } } } } }),
    prisma.actionItem.count({
      where: {
        completed: false,
        deadline: { lt: new Date() },
        summary: { email: { account: { userId } } },
      },
    }),
  ]);
  return { open, done, overdue };
};

export default { listTasks, updateTask, taskStats };
