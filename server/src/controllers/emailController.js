// Email controllers - thin layers: validate -> service -> serialize.
import { asyncHandler } from '../lib/errors.js';
import emailService from '../services/emailService.js';
import aiService from '../services/ai/aiService.js';
import { getPreferences } from '../services/preferenceService.js';

export const list = asyncHandler(async (req, res) => {
  const result = await emailService.listEmails(req.user.id, req.query);
  res.json(result);
});

export const detail = asyncHandler(async (req, res) => {
  const email = await emailService.getEmail(req.user.id, req.params.id);
  res.json({ email });
});

export const sync = asyncHandler(async (req, res) => {
  const preference = await getPreferences(req.user.id);
  const summary = await emailService.syncEmails(req.user.id, req.body || {});
  const analyzed = await emailService.analyzeMissingSummaries(req.user.id, {
    limit: req.body?.analyzeLimit ?? 10,
    summaryLength: preference.summaryLength,
    language: preference.language,
  });
  res.json({ sync: summary, analysis: analyzed });
});

export const analyzePending = asyncHandler(async (req, res) => {
  const preference = await getPreferences(req.user.id);
  const result = await emailService.analyzeMissingSummaries(req.user.id, {
    limit: req.body?.limit ?? 10,
    summaryLength: req.body?.summaryLength || preference.summaryLength,
    language: req.body?.language || preference.language,
  });
  res.json(result);
});

export const setRead = asyncHandler(async (req, res) => {
  const email = await emailService.setReadStatus(req.user.id, req.params.id, req.body.isRead);
  res.json({ email: emailService.serializeEmail(email) });
});

export const bulkRead = asyncHandler(async (req, res) => {
  const result = await emailService.bulkSetRead(req.user.id, req.body.ids, req.body.isRead);
  res.json(result);
});

export const remove = asyncHandler(async (req, res) => {
  res.json(await emailService.deleteEmail(req.user.id, req.params.id));
});

export const sendReply = asyncHandler(async (req, res) => {
  const result = await emailService.sendReply(req.user.id, req.params.id, req.body);
  res.json({ sent: true, ...result });
});

export const accounts = asyncHandler(async (req, res) => {
  res.json({ accounts: await emailService.listAccounts(req.user.id) });
});

// Re-runs the AI pipeline (used after changing summary length or language).
export const reanalyze = asyncHandler(async (req, res) => {
  const preference = await getPreferences(req.user.id);
  const result = await emailService.reanalyzeInbox(req.user.id, {
    limit: req.body?.limit ?? 25,
    summaryLength: req.body?.summaryLength || preference.summaryLength,
    language: req.body?.language || preference.language,
  });
  res.json(result);
});

export default { list, detail, sync, analyzePending, setRead, bulkRead, remove, sendReply, accounts, reanalyze };
