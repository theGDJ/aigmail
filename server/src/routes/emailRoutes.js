import { Router } from 'express';
import { z } from 'zod';
import emailController from '../controllers/emailController.js';
import { validate } from '../middleware/validate.js';
import { CATEGORIES, PRIORITIES, SUMMARY_LENGTHS, LANGUAGE_CODES } from '../config/constants.js';

const router = Router();

const idParam = z.object({ params: z.object({ id: z.string().min(1) }) });

const listSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    q: z.string().trim().max(200).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    sort: z.enum(['newest', 'oldest', 'unread']).optional(),
    accountId: z.string().optional(),
    unreadOnly: z.coerce.boolean().optional(),
    importantOnly: z.coerce.boolean().optional(),
    actionRequired: z.coerce.boolean().optional(),
    riskOnly: z.coerce.boolean().optional(),
    analyzed: z.coerce.boolean().optional(),
    from: z.string().trim().max(200).optional(),
    since: z.string().datetime().optional(),
    until: z.string().datetime().optional(),
  }),
});

const syncSchema = z.object({
  body: z
    .object({
      accountId: z.string().optional(),
      maxResults: z.coerce.number().int().positive().max(100).optional(),
      query: z.string().max(200).optional(),
      analyzeLimit: z.coerce.number().int().min(0).max(50).optional(),
    })
    .optional()
    .default({}),
});

const readSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ isRead: z.boolean() }),
});

const bulkReadSchema = z.object({
  body: z.object({ ids: z.array(z.string().min(1)).min(1).max(100), isRead: z.boolean() }),
});

const replySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    body: z.string().trim().min(1).max(20000),
    subject: z.string().trim().max(300).optional(),
    to: z.string().email().optional(),
  }),
});

const reanalyzeSchema = z.object({
  body: z
    .object({
      limit: z.coerce.number().int().positive().max(100).optional(),
      summaryLength: z.enum(SUMMARY_LENGTHS).optional(),
      language: z.enum(LANGUAGE_CODES).optional(),
    })
    .optional()
    .default({}),
});

router.get('/', validate(listSchema), emailController.list);
router.get('/accounts', emailController.accounts);
router.post('/sync', validate(syncSchema), emailController.sync);
router.post('/analyze-pending', validate(reanalyzeSchema), emailController.analyzePending);
router.post('/reanalyze', validate(reanalyzeSchema), emailController.reanalyze);
router.patch('/bulk/read', validate(bulkReadSchema), emailController.bulkRead);
router.get('/:id', validate(idParam), emailController.detail);
router.patch('/:id/read', validate(readSchema), emailController.setRead);
router.post('/:id/reply', validate(replySchema), emailController.sendReply);
router.delete('/:id', validate(idParam), emailController.remove);

export default router;
