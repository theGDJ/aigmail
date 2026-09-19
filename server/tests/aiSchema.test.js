import { describe, expect, it } from 'vitest';
import { validateAnalysis } from '../src/services/ai/schema.js';
import { parseJsonResponse } from '../src/services/ai/openaiClient.js';
import { buildAnalysisPrompt, PROMPT_VERSION } from '../src/services/ai/prompts.js';

const valid = {
  summary: 'The client moved the review to tomorrow 11 AM and asked for the updated deck.',
  key_points: ['Review moved to tomorrow 11 AM', 'Updated deck required'],
  action_items: [{ task: 'Update the client deck', deadline_text: 'tomorrow 9 AM' }],
  deadlines: [{ description: 'Client review', date_text: 'tomorrow', type: 'MEETING' }],
  priority: 'URGENT',
  category: 'WORK',
  importance_score: 92,
  importance_reasons: ['Deadline within 24 hours', 'Requires user action'],
  requires_reply: true,
  reply_rationale: 'Client expects confirmation',
  risk_level: 'LOW',
  risk_reasons: [],
};

describe('validateAnalysis', () => {
  it('accepts a well-formed payload', () => {
    const result = validateAnalysis(valid);
    expect(result.ok).toBe(true);
    expect(result.data.priority).toBe('URGENT');
    expect(result.data.action_items).toHaveLength(1);
  });

  it('rejects an unknown priority/category instead of storing garbage', () => {
    const result = validateAnalysis({ ...valid, priority: 'SUPER_URGENT', category: 'NONSENSE' });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects a missing summary', () => {
    expect(validateAnalysis({ ...valid, summary: '' }).ok).toBe(false);
  });

  it('coerces numeric strings for the importance score and clamps the range', () => {
    expect(validateAnalysis({ ...valid, importance_score: '88' }).data.importance_score).toBe(88);
    expect(validateAnalysis({ ...valid, importance_score: 500 }).ok).toBe(false);
  });

  it('defaults optional collections so downstream code is safe', () => {
    const { data } = validateAnalysis({ summary: 'Only a summary.' });
    expect(data.key_points).toEqual([]);
    expect(data.action_items).toEqual([]);
    expect(data.priority).toBe('MEDIUM');
    expect(data.risk_level).toBe('LOW');
  });
});

describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    expect(parseJsonResponse('{"a":1}').a).toBe(1);
  });

  it('strips markdown fences', () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```').a).toBe(1);
  });

  it('repairs trailing commas', () => {
    expect(parseJsonResponse('{"a":1,}').a).toBe(1);
  });

  it('extracts JSON embedded in prose', () => {
    expect(parseJsonResponse('Here you go: {"a":1} — done').a).toBe(1);
  });

  it('throws a typed error when there is no JSON at all', () => {
    expect(() => parseJsonResponse('not json')).toThrowError(/no JSON/i);
  });
});

describe('buildAnalysisPrompt', () => {
  it('embeds email metadata, the requested length and the JSON contract', () => {
    const prompt = buildAnalysisPrompt({
      email: {
        sender: 'a@b.com',
        senderName: 'A B',
        recipient: 'me@x.com',
        subject: 'Hello',
        body: 'Please review.',
        receivedAt: new Date('2026-09-10T08:00:00Z'),
        hasAttachments: false,
      },
      summaryLength: 'SHORT',
      language: 'HI',
    });
    expect(prompt).toContain('Subject: Hello');
    expect(prompt).toContain('Please review.');
    expect(prompt).toContain('Hindi');
    expect(prompt).toContain('"importance_score"');
    expect(prompt).toContain('at most 2 sentences');
    expect(PROMPT_VERSION).toMatch(/v\d/);
  });
});
