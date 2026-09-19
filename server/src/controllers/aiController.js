// AI controllers. Each endpoint loads the email (ownership-checked), calls the
// matching aiService function and returns the structured result.
import { asyncHandler, notFound } from '../lib/errors.js';
import prisma from '../lib/prisma.js';
import aiService from '../services/ai/aiService.js';
import { getPreferences } from '../services/preferenceService.js';
import { notifyIfImportant } from '../services/notificationService.js';

const loadEmail = async (userId, id) => {
  const email = await prisma.email.findFirst({ where: { id, account: { userId } } });
  if (!email) throw notFound('Email not found');
  return email;
};

const optionsFrom = async (userId, body = {}) => {
  const preference = await getPreferences(userId);
  return {
    summaryLength: body.summaryLength || preference.summaryLength,
    language: body.language || preference.language,
    force: Boolean(body.force),
  };
};

export const analyze = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const options = await optionsFrom(req.user.id, req.body);
  const result = await aiService.analyzeAndStore(email, options);
  await notifyIfImportant(req.user.id, email, result.summary);
  res.json({
    emailId: email.id,
    summary: result.summary,
    engine: result.engine,
    model: result.model,
    fallbackReason: result.fallbackReason,
    promptVersion: result.promptVersion,
  });
});

export const summarize = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const result = await aiService.summarizeEmail(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, ...result });
});

export const keyPoints = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const keyPoints = await aiService.extractKeyPoints(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, keyPoints });
});

export const actionItems = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const items = await aiService.extractActionItems(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, actionItems: items });
});

export const deadlines = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const result = await aiService.extractDeadlines(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, deadlines: result });
});

export const priority = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const result = await aiService.classifyPriority(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, priority: result });
});

export const category = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const result = await aiService.classifyCategory(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, category: result });
});

export const importance = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const result = await aiService.calculateImportance(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, ...result });
});

export const phishing = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const result = await aiService.detectPhishing(email, await optionsFrom(req.user.id, req.body));
  res.json({ emailId: email.id, ...result });
});

export const reply = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const summary = await prisma.summary.findUnique({
    where: { emailId: email.id },
    include: { actionItems: true, deadlines: true },
  });
  const result = await aiService.generateReply(email, {
    tone: req.body?.tone || 'PROFESSIONAL',
    language: req.body?.language || 'EN',
    summary,
  });
  res.json({ emailId: email.id, ...result, sent: false }); // never auto-sent
});

export const translate = asyncHandler(async (req, res) => {
  const email = await loadEmail(req.user.id, req.params.emailId);
  const summary = await prisma.summary.findUnique({ where: { emailId: email.id } });
  const result = await aiService.translateEmail(email, {
    targetLanguage: req.body.targetLanguage,
    scope: req.body.scope || 'summary',
    summary,
  });
  res.json({ emailId: email.id, ...result });
});

export const replyHistory = asyncHandler(async (_req, _res) => {
  // Replies are never stored in plain text (privacy by design); the endpoint
  // exists so the client can discover that behaviour explicitly.
  return _res.json({ replies: [], note: 'Draft replies are generated on demand and never persisted.' });
});

export default {
  analyze,
  summarize,
  keyPoints,
  actionItems,
  deadlines,
  priority,
  category,
  importance,
  phishing,
  reply,
  translate,
  replyHistory,
};
