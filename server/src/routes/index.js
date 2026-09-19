// API surface (spec section 21). Every /api route requires a session.
import { Router } from 'express';
import { z } from 'zod';
import authRoutes from './authRoutes.js';

export { authRoutes };
import emailRoutes from './emailRoutes.js';
import aiRoutes from './aiRoutes.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import misc from '../controllers/miscControllers.js';
import authController from '../controllers/authController.js';
import aiService from '../services/ai/aiService.js';
import { SUPPORTED_PROVIDERS } from '../services/providers/index.js';
import { features } from '../config/env.js';
import { CATEGORIES, PRIORITIES, LANGUAGES, SUMMARY_LENGTHS, REPLY_TONES, RISK_LEVELS } from '../config/constants.js';

const router = Router();

// --- public ---------------------------------------------------------------
router.use('/auth', authRoutes);

// --- everything below needs a valid session -------------------------------
router.use(requireAuth);

// Spec section 21: GET /api/auth/me (session + accounts + capabilities)
router.get('/auth/me', authController.me);

// Meta: vocabulary the client renders from (single source of truth).
router.get('/meta', (_req, res) => {
  res.json({
    categories: CATEGORIES,
    priorities: PRIORITIES,
    languages: LANGUAGES,
    summaryLengths: SUMMARY_LENGTHS,
    replyTones: REPLY_TONES,
    riskLevels: RISK_LEVELS,
    ai: {
      engine: aiService.engineName(),
      live: aiService.isAiLive(),
      promptVersion: aiService.promptVersion,
    },
    capabilities: {
      googleOAuth: features.googleOAuth,
      demoLogin: features.demoLogin,
      mockProvider: features.mockProvider,
      providers: SUPPORTED_PROVIDERS,
    },
  });
});

router.use('/emails', emailRoutes);
router.use('/ai', aiRoutes);

// --- tasks ---------------------------------------------------------------
const taskQuery = z.object({
  query: z.object({
    completed: z.enum(['true', 'false']).optional(),
    dueBefore: z.string().datetime().optional(),
    priority: z.enum(PRIORITIES).optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  }),
});
const taskUpdate = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    completed: z.coerce.boolean().optional(),
    task: z.string().trim().min(1).max(400).optional(),
    deadline: z.string().datetime().nullable().optional(),
  }),
});
router.get('/tasks', validate(taskQuery), misc.listTasks);
router.patch('/tasks/:id', validate(taskUpdate), misc.updateTask);

// --- analytics -----------------------------------------------------------
router.get('/analytics', validate(z.object({ query: z.object({ days: z.coerce.number().int().min(1).max(90).optional() }) })), misc.analytics);

// --- preferences ---------------------------------------------------------
const preferenceUpdate = z.object({
  body: z.object({
    summaryLength: z.enum(SUMMARY_LENGTHS).optional(),
    language: z.enum(LANGUAGES.map((l) => l.code)).optional(),
    notificationEnabled: z.coerce.boolean().optional(),
    digestEnabled: z.coerce.boolean().optional(),
    digestTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    timezone: z.string().max(64).optional(),
    phishingWarnings: z.coerce.boolean().optional(),
    voiceSummaries: z.coerce.boolean().optional(),
    notifiedImportanceMin: z.coerce.number().int().min(0).max(100).optional(),
  }),
});
router.get('/preferences', misc.readPreferences);
router.put('/preferences', validate(preferenceUpdate), misc.writePreferences);

// --- digest --------------------------------------------------------------
router.get(
  '/digest',
  validate(z.object({ query: z.object({ date: z.string().optional(), refresh: z.enum(['true', 'false']).optional() }) })),
  misc.digest,
);

// --- notifications -------------------------------------------------------
router.get('/notifications', misc.listNotifications);
router.patch('/notifications/read-all', misc.readAllNotifications);
router.patch('/notifications/:id', misc.readNotification);

export default router;
