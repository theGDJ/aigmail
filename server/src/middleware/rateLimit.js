// Rate limiting. AI routes are the most expensive, auth routes the most
// sensitive to brute force.
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const skipInTest = () => env.isTest;

const handler = (_req, res) =>
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' },
  });

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler,
});

export default apiLimiter;
