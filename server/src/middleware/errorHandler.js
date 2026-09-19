// Central error handling: one JSON shape for every failure.
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';
import createLogger from '../lib/logger.js';

const log = createLogger('http');

export const notFoundHandler = (req, res) =>
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` },
  });

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
export const errorHandler = (err, req, res, _next) => {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.statusCode : err.status || 500;

  if (status >= 500) {
    log.error(`${req.method} ${req.originalUrl} -> ${err.message}`, { stack: err.stack });
  } else {
    log.warn(`${req.method} ${req.originalUrl} -> ${status} ${err.message}`);
  }

  const payload = {
    error: {
      code: isAppError ? err.code : 'INTERNAL_ERROR',
      message: status >= 500 && !isAppError ? 'Something went wrong.' : err.message,
      ...(err.details ? { details: err.details } : {}),
      ...(env.isProd ? {} : { stack: err.stack?.split('\n').slice(0, 4) }),
    },
  };
  res.status(status).json(payload);
};

export default errorHandler;
