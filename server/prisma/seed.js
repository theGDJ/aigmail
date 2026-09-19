// ---------------------------------------------------------------------------
// Seed script: creates a ready-to-explore demo account.
//
//   npm run db:seed
//
// It builds the demo user, connects a MOCK email account, syncs the seeded
// mailbox, runs the AI analysis pipeline over it and generates today's digest.
// Safe to re-run: everything is upserted.
// ---------------------------------------------------------------------------
import prisma from '../src/lib/prisma.js';
import authService from '../src/services/authService.js';
import emailService from '../src/services/emailService.js';
import aiService from '../src/services/ai/aiService.js';
import digestService from '../src/services/digestService.js';
import { notifyIfImportant } from '../src/services/notificationService.js';
import { getPreferences } from '../src/services/preferenceService.js';
import { aiEngine } from '../src/config/env.js';

const main = async () => {
  console.log('\n🌱  Seeding AI Mail Summarizer\n');

  const { user, account } = await authService.loginAsDemo();
  const preference = await getPreferences(user.id);
  console.log(`• demo user      : ${user.email} (${user.id})`);
  console.log(`• email account  : ${account.provider} <${account.email}>`);
  console.log(`• preferences    : ${preference.summaryLength} / ${preference.language}`);
  console.log(`• AI engine      : ${aiEngine === 'openai' ? 'OpenAI' : 'local deterministic engine'}\n`);

  const sync = await emailService.syncEmails(user.id, { maxResults: 100 });
  console.log(`• sync           : fetched ${sync.fetched}, created ${sync.created}, updated ${sync.updated}`);

  const emails = await prisma.email.findMany({
    where: { accountId: account.id },
    orderBy: { receivedAt: 'desc' },
  });

  let analyzed = 0;
  for (const email of emails) {
    const result = await aiService.analyzeAndStore(email, {
      summaryLength: preference.summaryLength,
      language: preference.language,
    });
    await notifyIfImportant(user.id, email, result.summary);
    analyzed += 1;
  }
  console.log(`• AI analysis    : ${analyzed} emails summarized`);

  const digest = await digestService.buildDigest(user.id, { force: true });
  console.log(`• daily digest   : "${digest.headline}"`);

  const [notifications, tasks, deadlines] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id } }),
    prisma.actionItem.count({ where: { summary: { email: { accountId: account.id } } } }),
    prisma.deadline.count({ where: { summary: { email: { accountId: account.id } } } }),
  ]);

  console.log(
    `\n✅  Done.\n    • ${notifications} notifications\n    • ${tasks} action items\n    • ${deadlines} detected deadlines\n\n` +
      '   Sign in at http://localhost:5173/login with "Continue with demo mailbox".\n',
  );
};

main()
  .catch((err) => {
    console.error('\n❌  Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
