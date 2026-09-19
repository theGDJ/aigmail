// Minimal structured logger (no extra dependency). Never log secrets/tokens.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const REDACT_KEYS = /(token|secret|key|authorization|password|cookie)/i;

const redact = (value, depth = 0) => {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, REDACT_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1)]),
  );
};

const emit = (level, scope, message, meta) => {
  if (LEVELS[level] > current) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} (${scope}) ${message}`;
  const payload = meta === undefined ? '' : ` ${JSON.stringify(redact(meta))}`;
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  stream(line + payload);
};

export const createLogger = (scope) => ({
  error: (message, meta) => emit('error', scope, message, meta),
  warn: (message, meta) => emit('warn', scope, message, meta),
  info: (message, meta) => emit('info', scope, message, meta),
  debug: (message, meta) => emit('debug', scope, message, meta),
});

// Default export is the factory so modules can do `import createLogger from ...`
export default createLogger;
