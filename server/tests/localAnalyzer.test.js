import { describe, expect, it } from 'vitest';
import analyzer from '../src/services/ai/localAnalyzer.js';

const email = (overrides = {}) => ({
  sender: 'menon@university.edu',
  senderName: 'Dr. Menon',
  subject: 'Final project report submission - Friday 5 PM',
  body:
    'Dear students,\n\n' +
    'The final project report must be submitted by Friday 5 PM through the portal. ' +
    'Please also prepare two questions on deployment for the review meeting on Monday at 10 AM. ' +
    'Late submissions lose two marks per day.\n\nThanks,\n--\nDr. Menon',
  receivedAt: new Date('2026-09-09T09:00:00Z'),
  hasAttachments: false,
  ...overrides,
});

describe('parseDateMention', () => {
  const ref = new Date('2026-09-09T09:00:00Z'); // Wednesday

  it('resolves weekday mentions to the next occurrence', () => {
    const { date } = analyzer.parseDateMention('due on Friday 5 PM', ref);
    expect(date).toBeInstanceOf(Date);
    expect(date.getDay()).toBe(5);
    expect(date.getHours()).toBe(17);
  });

  it('resolves relative words', () => {
    const { date } = analyzer.parseDateMention('need it by tomorrow 9 AM', ref);
    expect(date.getDate()).toBe(10);
    expect(date.getHours()).toBe(9);
  });

  it('resolves explicit day-month dates', () => {
    const { date } = analyzer.parseDateMention('payment is due on 25 August', ref);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(25);
  });

  it('returns null when no date is mentioned (never invents one)', () => {
    const result = analyzer.parseDateMention('thanks for the update', ref);
    expect(result.date).toBeNull();
    expect(result.dateText).toBeNull();
  });
});

describe('extractDeadlines', () => {
  it('finds deadlines, meetings and their types', () => {
    const deadlines = analyzer.extractDeadlines(email());
    expect(deadlines.length).toBeGreaterThanOrEqual(2);
    const types = deadlines.map((d) => d.type);
    expect(types).toContain('MEETING');
    expect(deadlines.some((d) => /report/i.test(d.description))).toBe(true);
  });

  it('does not create deadlines for emails without dates', () => {
    const deadlines = analyzer.extractDeadlines(email({ body: 'Just a quick thank you note. No action needed.' }));
    expect(deadlines).toEqual([]);
  });
});

describe('extractActionItems', () => {
  it('extracts requested tasks with due text', () => {
    const items = analyzer.extractActionItems(email());
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => /report/i.test(i.task))).toBe(true);
    expect(items.some((i) => i.dueText)).toBe(true);
  });

  it('ignores promotional boilerplate', () => {
    const items = analyzer.extractActionItems(
      email({ body: 'Big sale today! Unsubscribe from these emails at any time.' }),
    );
    expect(items).toEqual([]);
  });
});

describe('classification', () => {
  it('classifies a university email as EDUCATION', () => {
    expect(analyzer.classifyCategory(email())).toBe('EDUCATION');
  });

  it('classifies a promotional sender as PROMOTIONS', () => {
    expect(
      analyzer.classifyCategory(
        email({ sender: 'deals@techworldstore.example', senderName: 'TechWorld', subject: 'Sale: 20% off', body: 'Limited time offer. Unsubscribe.' }),
      ),
    ).toBe('PROMOTIONS');
  });

  it('raises priority when a near deadline and action are present', () => {
    const analysis = analyzer.analyzeLocally(email());
    expect(['URGENT', 'HIGH']).toContain(analysis.priority);
  });

  it('produces a deterministic importance score with reasons', () => {
    const first = analyzer.analyzeLocally(email());
    const second = analyzer.analyzeLocally(email());
    expect(first.importance_score).toBe(second.importance_score);
    expect(first.importance_score).toBeGreaterThan(20);
    expect(first.importance_score).toBeLessThanOrEqual(100);
    expect(first.importance_reasons.length).toBeGreaterThan(0);
  });
});

describe('detectPhishing', () => {
  it('flags credential harvesting with a suspicious URL as high risk', () => {
    const result = analyzer.detectPhishing(
      email({
        sender: 'security@account-security-verify.example',
        senderName: 'Account Security',
        subject: 'URGENT: verify your account or it will be suspended',
        body:
          'Your account will be suspended within 24 hours. Confirm your password and card number at http://secure-verify-account.example/login',
      }),
    );
    expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel);
    expect(result.signals).toContain('CREDENTIAL_REQUEST');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('leaves ordinary email at low risk', () => {
    const result = analyzer.detectPhishing(email());
    expect(result.riskLevel).toBe('LOW');
  });
});

describe('requiresReply', () => {
  it('is true for direct questions', () => {
    expect(analyzer.requiresReply(email({ body: 'Can you confirm the deck before the call?' }))).toBe(true);
  });

  it('is false for noreply newsletters', () => {
    expect(analyzer.requiresReply(email({ sender: 'noreply@news.example', body: 'Read the newsletter. Unsubscribe here.' }))).toBe(false);
  });
});

describe('summarize', () => {
  it('respects the requested length', () => {
    const long = { ...email(), body: Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} about the project timeline.`).join(' ') };
    const short = analyzer.summarize(long, 'SHORT');
    const detailed = analyzer.summarize(long, 'DETAILED');
    expect(short.length).toBeLessThan(detailed.length);
  });

  it('never returns empty output for a body with content', () => {
    expect(analyzer.summarize(email(), 'MEDIUM').length).toBeGreaterThan(10);
  });
});

describe('analyzeLocally contract', () => {
  it('returns the full structured shape the API promises', () => {
    const analysis = analyzer.analyzeLocally(email(), { summaryLength: 'MEDIUM' });
    expect(Object.keys(analysis).sort()).toEqual(
      [
        'action_items',
        'category',
        'deadlines',
        'engine',
        'importance_reasons',
        'importance_score',
        'key_points',
        'priority',
        'reply_rationale',
        'requires_reply',
        'risk_level',
        'risk_reasons',
        'summary',
      ].sort(),
    );
    for (const action of analysis.action_items) {
      expect(action).toHaveProperty('task');
      expect(action).toHaveProperty('deadline_text');
    }
  });
});

describe('generateLocalReply', () => {
  it('produces an editable draft mentioning open tasks', () => {
    const analysis = analyzer.analyzeLocally(email());
    const reply = analyzer.generateLocalReply({ email: email(), analysis: { actionItems: analysis.action_items }, tone: 'SHORT' });
    expect(reply).toContain('Hi');
    expect(reply).toContain('[Your name]');
  });
});
