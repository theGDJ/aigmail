// One PrismaClient for the whole process. All database access goes through
// services - route handlers never build queries themselves.
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__aiMailPrisma ||
  new PrismaClient({
    log: env.isProd ? ['error'] : ['error', 'warn'],
  });

if (!env.isProd) globalForPrisma.__aiMailPrisma = prisma;

export default prisma;
