import { Router } from 'express';
import authController from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Public capability probe used by the login page (no session required).
router.get('/status', authController.status);

// Google OAuth 2.0
router.get('/google', authLimiter, authController.googleLogin);
router.get('/google/callback', authController.googleCallback);

// Password-free demo session (seeded mailbox, no Google account required)
router.post('/demo', authLimiter, authController.demoLogin);

// Session
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

export default router;
