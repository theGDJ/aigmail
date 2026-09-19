import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/ai_mail_summarizer',
      SESSION_SECRET: 'test-secret-value-not-used-in-production',
    },
  },
});
