// ---------------------------------------------------------------------------
// AI output contract.
// Every analysis (whether produced by OpenAI or by the local engine) is passed
// through `validateAnalysis` before it can reach the database, so malformed or
// hallucinated shapes are rejected instead of stored.
// ---------------------------------------------------------------------------
import { z } from 'zod';
import { CATEGORIES, PRIORITIES, RISK_LEVELS, DEADLINE_TYPES } from '../../config/constants.js';

const nonEmpty = (max) => z.string().trim().min(1).max(max);
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const trimmed = typeof v === 'string' ? v.trim() : '';
    return trimmed.length ? trimmed.slice(0, 200) : null;
  });

const listOfStrings = (max, maxLen) =>
  z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .transform((arr = []) =>
      [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, max).map((s) => s.slice(0, maxLen)),
    );

export const actionItemSchema = z.object({
  task: nonEmpty(400),
  deadline_text: optionalText,
});

export const deadlineSchema = z.object({
  description: nonEmpty(300),
  date_text: optionalText,
  type: z.enum(DEADLINE_TYPES).optional().default('GENERAL'),
});

export const analysisSchema = z.object({
  summary: nonEmpty(4000),
  key_points: listOfStrings(8, 300),
  action_items: z.array(actionItemSchema).optional().default([]),
  deadlines: z.array(deadlineSchema).optional().default([]),
  priority: z.enum(PRIORITIES).optional().default('MEDIUM'),
  category: z.enum(CATEGORIES).optional().default('OTHER'),
  importance_score: z.coerce.number().min(0).max(100).optional().default(50),
  importance_reasons: listOfStrings(6, 200),
  requires_reply: z.boolean().optional().default(false),
  reply_rationale: optionalText,
  risk_level: z.enum(RISK_LEVELS).optional().default('LOW'),
  risk_reasons: listOfStrings(8, 200),
});

/**
 * Validates a raw AI payload. `fallback` is a locally computed analysis used
 * when the model returns something unusable - the caller decides whether to
 * retry with the model instead.
 */
export const validateAnalysis = (raw) => {
  const result = analysisSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data, issues: [] };
  }
  return {
    ok: false,
    data: null,
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
};

export const replySchema = z.object({
  reply: nonEmpty(8000),
});

export const translationSchema = z.object({
  translation: nonEmpty(20000),
});

export default { analysisSchema, validateAnalysis };
