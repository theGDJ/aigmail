// Quality guardrails for the analysis engines.
//
// These tests encode the decisions that keep the product trustworthy:
// no phantom deadlines, no greeting-as-task, no tasks from marketing mail,
// calibrated "urgent", and phishing warnings that do not cry wolf.
import { describe, expect, it } from 'vitest';
import analyzer from '../src/services/ai/localAnalyzer.js';
import { MOCK_EMAILS, buildMockEmails } from '../src/services/providers/mockData.js';

const email = (overrides = {}) => ({
  sender: 'someone@example.com',
  senderName: 'Someone',
  subject: 'Subject',
  body: 'Body.',
  receivedAt: new Date(),
  hasAttachments: false,
  ...overrides,
});

const bySubject = (fragment) => MOCK_EMAILS.find((m) => m.subject.toLowerCase().includes(fragment.toLowerCase()));

describe('no phantom deadlines', () => {
  it('ignores a date mention that carries no deadline language', () => {
    const result = analyzer.extractDeadlines(
      email({ body: "Sharing the notes from today's review since you missed it. The team approved the approach." }),
    );
    expect(result).toEqual([]);
  });

  it('still finds real deadlines with deadline language', () => {
    const result = analyzer.extractDeadlines(email({ body: 'The report is due by Friday 5 PM.' }));
    expect(result).toHaveLength(1);
    expect(result[0].dateText).toMatch(/friday/i);
  });

  it('resolves "within N days" deadlines', () => {
    const result = analyzer.extractDeadlines(email({ body: 'Please collect it within 7 days.' }));
    expect(result).toHaveLength(1);
    expect(result[0].date).toBeTruthy();
  });
});

describe('no greetings or nouns as tasks', () => {
  it('drops greetings and sign-offs', () => {
    expect(analyzer.isBoilerplateSentence('Hi,')).toBe(true);
    expect(analyzer.isBoilerplateSentence('Dear students,')).toBe(true);
    expect(analyzer.isBoilerplateSentence('Thanks,')).toBe(true);
    expect(analyzer.isBoilerplateSentence('The client moved our review forward to tomorrow 11 AM.')).toBe(false);
  });

  it('does not treat a noun phrase as an action item', () => {
    const items = analyzer.extractActionItems(
      email({ body: "Sharing the notes from today's review since you missed it. The review was positive." }),
    );
    expect(items).toEqual([]);
  });

  it('skips action items in bulk promotional mail', () => {
    const sale = email({
      sender: 'deals@store.example',
      subject: 'Flash sale - 40% off',
      body: 'Limited time offer on all items. Book before midnight on Friday. Unsubscribe at any time.',
    });
    const analysis = analyzer.analyzeLocally(sale);
    expect(analysis.category).toBe('PROMOTIONS');
    expect(analysis.action_items).toEqual([]);
    expect(['LOW', 'MEDIUM']).toContain(analysis.priority);
  });
});

describe('priority calibration', () => {
  it('reserves URGENT for real time pressure', () => {
    const deck = bySubject('client review deck');
    const analysis = analyzer.analyzeLocally(
      email({
        sender: deck.sender,
        senderName: deck.senderName,
        subject: deck.subject,
        body: deck.body,
        receivedAt: new Date(),
      }),
    );
    expect(analysis.priority).toBe('URGENT');
  });

  it('keeps an informational note out of the urgent bucket', () => {
    const notes = bySubject('architecture review');
    const analysis = analyzer.analyzeLocally(
      email({ sender: notes.sender, senderName: notes.senderName, subject: notes.subject, body: notes.body }),
    );
    expect(['MEDIUM', 'LOW', 'HIGH']).toContain(analysis.priority);
    expect(analysis.priority).not.toBe('URGENT');
    expect(analysis.deadlines).toEqual([]);
  });

  it('does not rate a past deadline as if it were imminent', () => {
    const past = email({
      sender: 'billing@vendor.example',
      subject: 'Invoice due 25 August',
      body: 'Your invoice for Rs. 12,480 is due on 25 August. Please pay through the portal.',
      receivedAt: new Date('2026-09-18T09:00:00Z'),
    });
    const analysis = analyzer.analyzeLocally(past);
    expect(analysis.priority).not.toBe('URGENT');
    expect(analysis.importance_reasons.join(' ')).not.toMatch(/within 48 hours/i);
  });
});

describe('security calibration', () => {
  it('escalates credential harvesting with a suspicious link', () => {
    const phish = bySubject('verify your account');
    const analysis = analyzer.analyzeLocally(
      email({ sender: phish.sender, senderName: phish.senderName, subject: phish.subject, body: phish.body }),
    );
    expect(analysis.risk_level).toBe('CRITICAL');
    expect(analysis.category).toBe('IMPORTANT');
    expect(analysis.priority).toBe('URGENT');
  });

  it('does not raise an alert for a newsletter or a CI notification', () => {
    const newsletter = bySubject('5 things that matter');
    const ci = bySubject('CI failed');
    const newsletterAnalysis = analyzer.analyzeLocally(
      email({ sender: newsletter.sender, subject: newsletter.subject, body: newsletter.body }),
    );
    const ciAnalysis = analyzer.analyzeLocally(email({ sender: ci.sender, subject: ci.subject, body: ci.body }));
    expect(newsletterAnalysis.risk_level).toBe('LOW');
    expect(ciAnalysis.risk_level).toBe('LOW');
  });
});

describe('seeded mailbox sanity', () => {
  it('produces exactly one risky email in the demo data set', () => {
    const analyzed = buildMockEmails(new Date()).map((mail) => analyzer.analyzeLocally(mail));
    const risky = analyzed.filter((a) => ['HIGH', 'CRITICAL'].includes(a.risk_level));
    expect(risky).toHaveLength(1);
    expect(risky[0].risk_level).toBe('CRITICAL');
  });

  it('never returns an empty summary or an out-of-range score', () => {
    for (const mail of buildMockEmails(new Date())) {
      const analysis = analyzer.analyzeLocally(mail);
      expect(analysis.summary.length).toBeGreaterThan(5);
      expect(analysis.importance_score).toBeGreaterThanOrEqual(0);
      expect(analysis.importance_score).toBeLessThanOrEqual(100);
      for (const deadline of analysis.deadlines) {
        expect(['EXPLICIT', 'MEETING', 'APPOINTMENT', 'GENERAL']).toContain(deadline.type);
        expect(deadline.date_text).toBeTruthy();
      }
    }
  });
});
