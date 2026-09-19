// Typed application errors + an async wrapper so route handlers never need
// try/catch. The error middleware turns these into consistent JSON envelopes.
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expected = true;
  }
}

export const badRequest = (message, details) => new AppError(message, 400, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(message, 401, 'UNAUTHORIZED');
export const forbidden = (message = 'Not allowed') => new AppError(message, 403, 'FORBIDDEN');
export const notFound = (message = 'Resource not found') => new AppError(message, 404, 'NOT_FOUND');
export const tooMany = (message = 'Too many requests') => new AppError(message, 429, 'RATE_LIMITED');
export const upstream = (message, details) =>
  new AppError(message, 502, 'UPSTREAM_FAILURE', details);

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default { AppError, asyncHandler };
