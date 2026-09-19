// ---------------------------------------------------------------------------
// aiService - the only module that talks to the AI provider.
//
// Route handlers call these functions; they never build prompts or touch the
// model directly. Each function has a documented, validated contract, and every
// path degrades to the deterministic local engine instead of failing the user.
// ---------------------------------------------------------------------------
import { aiEngine, features } from '../../config/env.js';
import { AppError, notFound } from '../../lib/errors.js';
import prisma from '../../lib/prisma.js';
import createLogger from '../../lib/logger.js';
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildReplyPrompt,
  buildReplySystemPrompt,
  buildTranslationPrompt,
  PROMPT_VERSION,
} from './prompts.js';
import { validateAnalysis } from './schema.js';
import { completeJson, isEnabled as aiEnabled } from './openaiClient.js';
import localAnalyzer from './localAnalyzer.js';
import { LANGUAGES } from '../../config/constants.js';

const log = createLogger('ai');

export const engineName = () => (aiEnabled() ? 'openai' : 'local');
export const isAiLive = () => aiEnabled();
export const promptVersion = PROMPT_VERSION;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Resolves an explicitly mentioned date text into an absolute date.
 *  Returns null when the text contains no date - we never invent one. */
const resolveDate = (text, reference) => {
  if (!text) return null;
  const { date } = localAnalyzer.parseDateMention(text, reference);
  return date || null;
};

const shapeForPersistence = (analysis, email) => {
  const reference = new Date(email.receivedAt || Date.now());
  return {
    summary: analysis.summary,
    keyPoints: analysis.key_points || [],
    priority: analysis.priority,
    category: analysis.category,
    importanceScore: analysis.importance_score,
    importanceReasons: analysis.importance_reasons || [],
    requiresReply: Boolean(analysis.requires_reply),
    replyRationale: analysis.reply_rationale || null,
    riskLevel: analysis.risk_level,
    riskReasons: analysis.risk_reasons || [],
    actionItems: (analysis.action_items || []).map((item) => ({
      task: item.task,
      dueText: item.deadline_text || null,
      deadline: resolveDate(item.deadline_text, reference),
    })),
    deadlines: (analysis.deadlines || []).map((deadline) => ({
      description: deadline.description,
      dateText: deadline.date_text || null,
      date: resolveDate(deadline.date_text, reference),
      type: deadline.type || 'GENERAL',
    })),
  };
};

// ---------------------------------------------------------------------------
// structured analysis
// ---------------------------------------------------------------------------

/**
 * Analyzes one email and returns the validated structured result.
 * OpenAI is used when configured; otherwise (or on failure) the deterministic
 * local engine produces the same shape.
 */
export const analyzeEmail = async (email, { summaryLength = 'MEDIUM', language = 'EN' } = {}) => {
  const baseline = localAnalyzer.analyzeLocally(email, { summaryLength });
  if (!aiEnabled()) {
    return { analysis: baseline, engine: 'local', model: null, promptVersion: PROMPT_VERSION };
  }

  const requestOnce = async (extraInstructions) => {
    const { data, model } = await completeJson({
      system: ANALYSIS_SYSTEM_PROMPT,
      user: extraInstructions
        ? `${buildAnalysisPrompt({ email, summaryLength, language })}\n\nYour previous answer was invalid: ${extraInstructions}\nReturn corrected JSON only.`
        : buildAnalysisPrompt({ email, summaryLength, language }),
      maxTokens: 1600,
      temperature: 0.1,
    });
    return { data, model };
  };

  try {
    const first = await requestOnce();
    const validation = validateAnalysis(first.data);
    if (validation.ok) {
      return { analysis: validation.data, engine: 'openai', model: first.model, promptVersion: PROMPT_VERSION };
    }

    // One repair attempt, then fall back locally.
    log.warn('AI response failed validation, retrying once', { issues: validation.issues.slice(0, 3) });
    const retry = await requestOnce(
      validation.issues.map((i) => `${i.path}: ${i.message}`).join('; ') || 'shape mismatch',
    );
    const retryValidation = validateAnalysis(retry.data);
    if (retryValidation.ok) {
      return { analysis: retryValidation.data, engine: 'openai', model: retry.model, promptVersion: PROMPT_VERSION };
    }
    log.error('AI response still invalid after retry - using local engine', {
      issues: retryValidation.issues.slice(0, 3),
    });
    return { analysis: baseline, engine: 'local', model: null, promptVersion: PROMPT_VERSION, fallbackReason: 'invalid_ai_output' };
  } catch (err) {
    log.warn('AI analysis failed - using local engine', { code: err.code, message: err.message });
    return { analysis: baseline, engine: 'local', model: null, promptVersion: PROMPT_VERSION, fallbackReason: err.code || 'ai_error' };
  }
};

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

/** Stores (or refreshes) the analysis for an email, replacing derived rows. */
export const persistAnalysis = async (email, shaped, { engine = 'local', model = null, language = 'EN' } = {}) => {
  const data = {
    summary: shaped.summary,
    keyPoints: shaped.keyPoints,
    priority: shaped.priority,
    category: shaped.category,
    importanceScore: shaped.importanceScore,
    importanceReasons: shaped.importanceReasons,
    requiresReply: shaped.requiresReply,
    replyRationale: shaped.replyRationale,
    riskLevel: shaped.riskLevel,
    riskReasons: shaped.riskReasons,
    language,
    engine,
    modelUsed: model,
  };

  return prisma.$transaction(async (tx) => {
    const summary = await tx.summary.upsert({
      where: { emailId: email.id },
      create: { emailId: email.id, ...data },
      update: data,
    });

    // Children are fully derived from the analysis - replace them atomically.
    await tx.actionItem.deleteMany({ where: { summaryId: summary.id } });
    await tx.deadline.deleteMany({ where: { summaryId: summary.id } });

    if (shaped.actionItems.length) {
      await tx.actionItem.createMany({
        data: shaped.actionItems.map((item) => ({
          summaryId: summary.id,
          task: item.task,
          dueText: item.dueText,
          deadline: item.deadline,
        })),
      });
    }
    if (shaped.deadlines.length) {
      await tx.deadline.createMany({
        data: shaped.deadlines.map((deadline) => ({
          summaryId: summary.id,
          description: deadline.description,
          dateText: deadline.dateText,
          date: deadline.date,
          type: deadline.type,
        })),
      });
    }

    return tx.summary.findUnique({
      where: { id: summary.id },
      include: { actionItems: true, deadlines: true },
    });
  });
};

/** load + analyze + persist in one call (used by every AI route). */
export const analyzeAndStore = async (email, { summaryLength = 'MEDIUM', language = 'EN' } = {}) => {
  const { analysis, engine, model, fallbackReason } = await analyzeEmail(email, { summaryLength, language });
  const shaped = shapeForPersistence(analysis, email);
  const stored = await persistAnalysis(email, shaped, { engine, model, language });
  return { summary: stored, engine, model, fallbackReason, promptVersion: PROMPT_VERSION };
};

export const getSummaryRecord = async (emailId) => {
  const summary = await prisma.summary.findUnique({
    where: { emailId },
    include: { actionItems: true, deadlines: true },
  });
  if (!summary) throw notFound('No AI summary exists for this email yet');
  return summary;
};

/** Everything the individual extractors need: analyze on demand, then project. */
const ensureSummary = async (email, options) => {
  const existing = await prisma.summary.findUnique({
    where: { emailId: email.id },
    include: { actionItems: true, deadlines: true },
  });
  if (existing && !options.force) return { summary: existing, engine: existing.engine };
  const result = await analyzeAndStore(email, options);
  return { summary: result.summary, engine: result.engine, fallbackReason: result.fallbackReason };
};

// ---------------------------------------------------------------------------
// individual capabilities (spec sections 3-9, 15)
// ---------------------------------------------------------------------------

export const summarizeEmail = async (email, options = {}) => {
  const { summary } = await ensureSummary(email, options);
  return { summary: summary.summary, engine: summary.engine, priority: summary.priority, category: summary.category };
};

export const extractKeyPoints = async (email, options = {}) => (await ensureSummary(email, options)).summary.keyPoints;

export const extractActionItems = async (email, options = {}) =>
  (await ensureSummary(email, options)).summary.actionItems;

export const extractDeadlines = async (email, options = {}) => (await ensureSummary(email, options)).summary.deadlines;

export const classifyPriority = async (email, options = {}) => (await ensureSummary(email, options)).summary.priority;

export const classifyCategory = async (email, options = {}) => (await ensureSummary(email, options)).summary.category;

export const calculateImportance = async (email, options = {}) => {
  const { summary } = await ensureSummary(email, options);
  return { score: summary.importanceScore, reasons: summary.importanceReasons };
};

export const detectPhishing = async (email, options = {}) => {
  const { summary } = await ensureSummary(email, options);
  return { riskLevel: summary.riskLevel, reasons: summary.riskReasons };
};

export const requiresReply = async (email, options = {}) => {
  const { summary } = await ensureSummary(email, options);
  return { requiresReply: summary.requiresReply, rationale: summary.replyRationale };
};

// ---------------------------------------------------------------------------
// reply generation + translation
// ---------------------------------------------------------------------------

export const generateReply = async (email, { tone = 'PROFESSIONAL', language = 'EN', summary } = {}) => {
  const existing = summary
    ? {
        actionItems: summary.actionItems || [],
        deadlines: (summary.deadlines || []).map((d) => ({ description: d.description, dateText: d.dateText })),
      }
    : null;

  if (aiEnabled()) {
    try {
      const { data, model } = await completeJson({
        system: buildReplySystemPrompt(),
        user: `${buildReplyPrompt({ email, analysis: existing, tone, language })}

Return JSON: {"reply": "..."}`,
        maxTokens: 900,
        temperature: 0.5,
      });
      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (reply) return { reply, engine: 'openai', model, tone };
    } catch (err) {
      log.warn('Reply generation failed - using local template', { code: err.code });
    }
  }

  return {
    reply: localAnalyzer.generateLocalReply({ email, analysis: existing, tone }),
    engine: 'local',
    model: null,
    tone,
  };
};

/** Translates a single text block, with cache read/write handled by caller. */
const translateText = async (text, targetLanguage) => {
  const source = String(text || '').slice(0, 8000);
  if (!source.trim()) return { content: '', engine: 'noop' };

  if (aiEnabled()) {
    try {
      const { data } = await completeJson({
        system: 'You are a precise translator. Return JSON only: {"translation": "..."}',
        user: buildTranslationPrompt({ text: source, targetLanguage }),
        maxTokens: 2500,
        temperature: 0,
      });
      if (typeof data?.translation === 'string' && data.translation.trim()) {
        return { content: data.translation.trim(), engine: 'openai' };
      }
    } catch (err) {
      log.warn('Translation failed - using glossary fallback', { code: err.code });
    }
  }
  return { content: localAnalyzer.localTranslate(source, targetLanguage), engine: 'local' };
};

/**
 * Translates an email body and/or its AI summary, caching each result.
 * `scope` is 'email' | 'summary' | 'both'.
 */
export const translateEmail = async (email, { targetLanguage, scope = 'summary', summary } = {}) => {
  if (!LANGUAGES.some((l) => l.code === targetLanguage)) {
    throw new AppError(`Unsupported language "${targetLanguage}"`, 400, 'UNSUPPORTED_LANGUAGE');
  }
  if (targetLanguage === 'EN') {
    return {
      targetLanguage,
      emailText: scope === 'summary' ? null : email.body,
      summaryText: scope === 'email' ? null : summary?.summary || null,
      engine: 'noop',
    };
  }

  let emailText = null;
  let summaryText = null;
  let engine = 'local';

  if (scope === 'email' || scope === 'both') {
    const cached = await prisma.translation.findFirst({ where: { emailId: email.id, targetLanguage } });
    if (cached) {
      emailText = cached.content;
      engine = cached.engine;
    } else {
      const result = await translateText(email.body, targetLanguage);
      emailText = result.content;
      engine = result.engine;
      await prisma.translation.upsert({
        where: { emailId_targetLanguage: { emailId: email.id, targetLanguage } },
        create: { emailId: email.id, targetLanguage, content: emailText, engine },
        update: { content: emailText, engine },
      });
    }
  }

  if ((scope === 'summary' || scope === 'both') && summary?.summary) {
    const cached = summary.id
      ? await prisma.translation.findFirst({ where: { summaryId: summary.id, targetLanguage } })
      : null;
    if (cached) {
      summaryText = cached.content;
    } else {
      const result = await translateText(summary.summary, targetLanguage);
      summaryText = result.content;
      engine = result.engine;
      if (summary.id) {
        await prisma.translation.upsert({
          where: { summaryId_targetLanguage: { summaryId: summary.id, targetLanguage } },
          create: { summaryId: summary.id, targetLanguage, content: summaryText, engine },
          update: { content: summaryText, engine },
        });
      }
    }
  }

  return { targetLanguage, emailText, summaryText, engine };
};

export default {
  analyzeEmail,
  analyzeAndStore,
  persistAnalysis,
  getSummaryRecord,
  summarizeEmail,
  extractKeyPoints,
  extractActionItems,
  extractDeadlines,
  classifyPriority,
  classifyCategory,
  calculateImportance,
  detectPhishing,
  requiresReply,
  generateReply,
  translateEmail,
  engineName,
  isAiLive,
  promptVersion,
};

export { engineName as aiEngineName, features as aiFeatures };
export const configuredEngine = aiEngine;
export const openAiConfigured = features.openai;
