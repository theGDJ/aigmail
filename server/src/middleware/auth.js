// Authorization middleware. Attaches `req.user` (never tokens) or rejects.
import { verifySession, SESSION_COOKIE } from '../lib/session.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import prisma from '../lib/prisma.js';

export const requireAuth = async (req, _res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw unauthorized();
    const payload = verifySession(token);
    if (!payload?.sub) throw unauthorized('Session expired, please sign in again');

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { preference: true },
    });
    if (!user) throw unauthorized('Account no longer exists');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// Future-proofing: role-gated routes.
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
  next();
};

export default requireAuth;
