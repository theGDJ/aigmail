// ---------------------------------------------------------------------------
// Thin OpenAI wrapper.
// Responsibilities: timeouts, bounded retries with backoff, JSON extraction
// and turning provider errors into typed AppErrors. No prompts or business
// logic live here (see prompts.js / aiService.js).
// ---------------------------------------------------------------------------
import OpenAI from 'openai';
import { env, features } from '../../config/env.js';
import { AppError, upstream } from '../../lib/errors.js';
import createLogger from '../../lib/logger.js';

const log = createLogger('openai');

let client = null;
const getClient = () => {
  if (!features.openai) {
    throw new AppError('AI provider not configured (set OPENAI_API_KEY).', 503, 'AI_NOT_CONFIGURED');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.AI_REQUEST_TIMEOUT_MS,
      maxRetries: 0, // retries are handled explicitly below for visibility
    });
  }
  return client;
};

export const isEnabled = () => features.openai;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (err) =>
  ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'APIConnectionTimeoutError'].includes(err?.code) ||
  err?.status === 429 ||
  (err?.status >= 500 && err?.status < 600);

const mapError = (err) => {
  if (err instanceof AppError) return err;
  if (err?.status === 401 || err?.status === 403) {
    return new AppError('OpenAI rejected the API key.', 502, 'AI_AUTH_FAILED');
  }
  if (err?.status === 429) return new AppError('AI rate limit reached, try again shortly.', 429, 'AI_RATE_LIMITED');
  if (err?.code === 'APIConnectionTimeoutError' || err?.code === 'ETIMEDOUT') {
    return new AppError('The AI provider timed out.', 504, 'AI_TIMEOUT');
  }
  if (err?.status === 400 && /context length|too long/i.test(err?.message || '')) {
    return new AppError('This email is too long for the AI model.', 413, 'AI_INPUT_TOO_LONG');
  }
  return upstream(`AI request failed: ${err?.message || 'unknown error'}`);
};

const chat = async ({ system, user, maxTokens = 1200, temperature = 0.2, retries = 2 }) => {
  const openai = getClient();
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const response = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      return { content: response.choices?.[0]?.message?.content || '', model: env.OPENAI_MODEL };
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) throw mapError(err);
      const backoff = 600 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      log.warn(`Retrying AI request (attempt ${attempt}) in ${backoff}ms`, { code: err?.code || err?.status });
      await sleep(backoff);
    }
  }
};

/** Extracts the first JSON object from a model response, tolerating fences. */
export const parseJsonResponse = (content = '') => {
  const cleaned = String(content)
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new AppError('AI response contained no JSON object.', 502, 'AI_BAD_JSON');
  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Common model slips: trailing commas.
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      throw new AppError('AI response was not valid JSON.', 502, 'AI_BAD_JSON');
    }
  }
};

export const completeJson = async (options) => {
  const { content, model } = await chat(options);
  return { data: parseJsonResponse(content), model };
};

export const completeText = async (options) => {
  const { content, model } = await chat({ ...options, maxTokens: options.maxTokens ?? 900 });
  return { text: content.trim(), model };
};

export default { isEnabled, completeJson, completeText, parseJsonResponse };
