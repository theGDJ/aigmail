import { Router } from 'express';
import { z } from 'zod';
import aiController from '../controllers/aiController.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { SUMMARY_LENGTHS, LANGUAGE_CODES, REPLY_TONES } from '../config/constants.js';

const router = Router();
router.use(aiLimiter);

const emailParam = z.object({ params: z.object({ emailId: z.string().min(1) }) });

const analyzeSchema = z.object({
  params: z.object({ emailId: z.string().min(1) }),
  body: z
    .object({
      summaryLength: z.enum(SUMMARY_LENGTHS).optional(),
      language: z.enum(LANGUAGE_CODES).optional(),
      force: z.coerce.boolean().optional(),
    })
    .optional()
    .default({}),
});

const replySchema = z.object({
  params: z.object({ emailId: z.string().min(1) }),
  body: z
    .object({
      tone: z.enum(REPLY_TONES).optional(),
      language: z.enum(LANGUAGE_CODES).optional(),
    })
    .optional()
    .default({}),
});

const translateSchema = z.object({
  params: z.object({ emailId: z.string().min(1) }),
  body: z.object({
    targetLanguage: z.enum(LANGUAGE_CODES),
    scope: z.enum(['email', 'summary', 'both']).optional(),
  }),
});

router.post('/analyze/:emailId', validate(analyzeSchema), aiController.analyze);
router.post('/summarize/:emailId', validate(analyzeSchema), aiController.summarize);
router.post('/key-points/:emailId', validate(analyzeSchema), aiController.keyPoints);
router.post('/action-items/:emailId', validate(analyzeSchema), aiController.actionItems);
router.post('/deadlines/:emailId', validate(analyzeSchema), aiController.deadlines);
router.post('/classify/:emailId', validate(analyzeSchema), aiController.priority);
router.post('/category/:emailId', validate(analyzeSchema), aiController.category);
router.post('/importance/:emailId', validate(analyzeSchema), aiController.importance);
router.post('/phishing/:emailId', validate(analyzeSchema), aiController.phishing);
router.post('/reply/:emailId', validate(replySchema), aiController.reply);
router.post('/translate/:emailId', validate(translateSchema), aiController.translate);
router.get('/replies', aiController.replyHistory);

export default router;
