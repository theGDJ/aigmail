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
let activeProvider = null;

const getClient = () => {
  if (!features.ai) {
    throw new AppError(
      'AI provider not configured (set OPENAI_API_KEY or GROQ_API_KEY).',
      503,
      'AI_NOT_CONFIGURED',
    );
  }
  if (!client) {
    if (features.groq) {
      activeProvider = 'groq';
      client = new OpenAI({
        apiKey: env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: env.AI_REQUEST_TIMEOUT_MS,
        maxRetries: 0, // retries are handled explicitly below for visibility
      });
    } else {
      activeProvider = 'openai';
      const clientConfig = {
        apiKey: env.OPENAI_API_KEY,
        timeout: env.AI_REQUEST_TIMEOUT_MS,
        maxRetries: 0,
      };
      if (env.OPENAI_BASE_URL) {
        clientConfig.baseURL = env.OPENAI_BASE_URL;
      }
      client = new OpenAI(clientConfig);
    }
  }
  return { client, provider: activeProvider };
};

export const isEnabled = () => features.ai;
export const getActiveProvider = () => activeProvider || (features.groq ? 'groq' : features.openai ? 'openai' : 'local');
export const getActiveModel = () => (features.groq ? env.GROQ_MODEL : env.OPENAI_MODEL);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (err) =>
  ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'APIConnectionTimeoutError'].includes(err?.code) ||
  err?.status === 429 ||
  (err?.status >= 500 && err?.status < 600);

const mapError = (err) => {
  if (err instanceof AppError) return err;
  if (err?.status === 401 || err?.status === 403) {
    return new AppError('AI provider rejected the API key.', 502, 'AI_AUTH_FAILED');
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

const chat = async ({ system, user, maxTokens = 2000, temperature = 0.2, retries = 2, jsonMode = true }) => {
  const { client: openai, provider } = getClient();
  const model = provider === 'groq' ? env.GROQ_MODEL : env.OPENAI_MODEL;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const payload = {
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      };
      if (jsonMode) {
        payload.response_format = { type: 'json_object' };
      }
      const response = await openai.chat.completions.create(payload);
      return { content: response.choices?.[0]?.message?.content || '', model };
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
    const withoutTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(withoutTrailingCommas);
    } catch {
      // Unescaped line breaks or control characters inside JSON strings
      try {
        const sanitized = withoutTrailingCommas.replace(/[\u0000-\u001F]+/g, (m) => {
          if (m === '\n') return '\\n';
          if (m === '\r') return '\\r';
          if (m === '\t') return '\\t';
          return '';
        });
        return JSON.parse(sanitized);
      } catch {
        throw new AppError('AI response was not valid JSON.', 502, 'AI_BAD_JSON');
      }
    }
  }
};

export const completeJson = async (options) => {
  const { content, model } = await chat(options);
  return { data: parseJsonResponse(content), model };
};

export const completeText = async (options) => {
  const { content, model } = await chat({ ...options, maxTokens: options.maxTokens ?? 1200, jsonMode: false });
  return { text: content.trim(), model };
};

export default { isEnabled, completeJson, completeText, parseJsonResponse };
