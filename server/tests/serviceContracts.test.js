// Contract tests.
//
// Controllers call services through their default export (`service.method()`),
// while the modules also expose named exports. A missing key previously caused a
// runtime 500 (`emailService.serializeEmail is not a function`). These tests fail
// fast when a method is added to the module but forgotten on the default object.
import { describe, expect, it } from 'vitest';

import aiService from '../src/services/ai/aiService.js';
import emailService from '../src/services/emailService.js';
import analyticsService from '../src/services/analyticsService.js';
import taskService from '../src/services/taskService.js';
import digestService from '../src/services/digestService.js';
import notificationService from '../src/services/notificationService.js';
import preferenceService from '../src/services/preferenceService.js';
import authService from '../src/services/authService.js';
import { getProviderForAccount, SUPPORTED_PROVIDERS, PROVIDERS } from '../src/services/providers/index.js';

const expectFns = (target, names) => {
  for (const name of names) {
    expect(typeof target[name], `${name} should be a function`).toBe('function');
  }
};

describe('service default exports expose everything controllers call', () => {
  it('aiService', () => {
    expectFns(aiService, [
      'analyzeEmail',
      'analyzeAndStore',
      'persistAnalysis',
      'getSummaryRecord',
      'summarizeEmail',
      'extractKeyPoints',
      'extractActionItems',
      'extractDeadlines',
      'classifyPriority',
      'classifyCategory',
      'calculateImportance',
      'detectPhishing',
      'requiresReply',
      'generateReply',
      'translateEmail',
      'engineName',
      'isAiLive',
    ]);
    expect(aiService.promptVersion).toMatch(/v\d/);
  });

  it('emailService', () => {
    expectFns(emailService, [
      'syncEmails',
      'analyzeMissingSummaries',
      'reanalyzeInbox',
      'listEmails',
      'serializeEmail',
      'getEmail',
      'setReadStatus',
      'bulkSetRead',
      'sendReply',
      'deleteEmail',
      'listAccounts',
      'ensureMockAccount',
      'countEmails',
    ]);
  });

  it('supporting services', () => {
    expectFns(analyticsService, ['getAnalytics']);
    expectFns(taskService, ['listTasks', 'updateTask', 'taskStats']);
    expectFns(digestService, ['buildDigest', 'deliverDueDigests']);
    expectFns(notificationService, ['notifyIfImportant', 'listNotifications', 'markNotificationRead', 'markAllRead', 'unreadCount']);
    expectFns(preferenceService, ['getPreferences', 'updatePreferences']);
    expectFns(authService, ['loginWithGoogle', 'loginAsDemo', 'serializeUser', 'logout', 'authStatus']);
  });
});

describe('provider interface', () => {
  it('implements the same surface for every supported provider', () => {
    for (const name of SUPPORTED_PROVIDERS) {
      const provider = PROVIDERS[name];
      expectFns(provider, ['listMessages', 'getMessage', 'setRead', 'sendMessage', 'getProfile']);
      expect(typeof provider.id).toBe('string');
    }
  });

  it('keeps Outlook registered but explicitly unsupported', () => {
    expect(PROVIDERS.OUTLOOK.unsupported).toBe(true);
    expect(SUPPORTED_PROVIDERS).not.toContain('OUTLOOK');
  });

  it('falls back to the mock provider for Gmail accounts without credentials', () => {
    const provider = getProviderForAccount({ provider: 'GMAIL' });
    expect(['mock', 'gmail']).toContain(provider.id);
  });

  it('rejects unknown providers with a typed error', () => {
    expect(() => getProviderForAccount({ provider: 'CARRIER_PIGEON' })).toThrowError(/unknown email provider/i);
  });
});

describe('email serialization', () => {
  it('never leaks account tokens in API payloads', async () => {
    const email = {
      id: 'e1',
      externalId: 'x1',
      threadId: 't1',
      sender: 'a@b.com',
      senderName: 'A',
      recipient: 'me@x.com',
      subject: 'Test',
      snippet: 'snip',
      receivedAt: new Date(),
      isRead: false,
      isStarred: false,
      hasAttachments: false,
      labels: ['INBOX'],
      summary: null,
      account: { id: 'acc1', provider: 'MOCK', email: 'me@x.com', accessToken: 'secret-token', refreshToken: 'secret-refresh' },
    };
    const withBody = emailService.serializeEmail(email, { includeBody: true, includeAccount: true });
    expect(withBody.body).toBeUndefined();
    expect(JSON.stringify(withBody)).not.toContain('secret');
    expect(withBody.summary).toBeNull();
    expect(withBody.account).toEqual({ id: 'acc1', provider: 'MOCK', email: 'me@x.com' });
  });
});
