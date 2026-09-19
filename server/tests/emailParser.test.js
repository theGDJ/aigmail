import { describe, expect, it } from 'vitest';
import {
  cleanEmailBody,
  htmlToText,
  normalizeWhitespace,
  parseGmailMessage,
  parseRawEmail,
  stripQuotedContent,
  stripSignature,
} from '../src/services/emailParser.js';

describe('htmlToText', () => {
  it('converts block markup to readable text and keeps links', () => {
    const html = '<p>Hello <b>team</b>,</p><p>See <a href="https://x.dev/report">the report</a>.</p><ul><li>One</li></ul>';
    const text = htmlToText(html);
    expect(text).toContain('Hello team');
    expect(text).toContain('https://x.dev/report');
    expect(text).toContain('- One');
  });

  it('strips scripts and styles', () => {
    expect(htmlToText('<style>p{color:red}</style><script>alert(1)</script><p>Safe</p>').trim()).toBe('Safe');
  });

  it('decodes entities', () => {
    expect(htmlToText('<p>A &amp; B &lt; C &#39;q&#39;</p>').trim()).toBe("A & B < C 'q'");
  });
});

describe('stripQuotedContent', () => {
  it('cuts everything after a reply marker', () => {
    const body = 'Please confirm the deck.\n\nOn Mon, 8 Sep at 09:12, Ravi <ravi@x.com> wrote:\n> older content';
    expect(stripQuotedContent(body)).toBe('Please confirm the deck.');
  });

  it('drops forwarded history', () => {
    const body = 'New ask: send the invoice.\n\n---------- Forwarded message ----------\nold stuff';
    expect(stripQuotedContent(body)).toContain('New ask');
    expect(stripQuotedContent(body)).not.toContain('old stuff');
  });
});

describe('stripSignature', () => {
  it('removes a conventional signature', () => {
    const body = 'Submitting the report on Friday.\n\nThanks,\n--\nPriya Sharma\nProject Office\n+91 90000 00000';
    expect(stripSignature(body).trim()).toBe('Submitting the report on Friday.\n\nThanks,');
  });
});

describe('cleanEmailBody', () => {
  it('normalizes whitespace across the whole pipeline', () => {
    const messy = 'Hi   team,\r\n\r\n\r\n  Deadline   is Friday  5 PM  \r\n\r\nOn Tue, A B wrote:\r\n> old';
    const clean = cleanEmailBody(messy);
    expect(clean).toBe('Hi team,\n\nDeadline is Friday 5 PM');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses runs of blank lines', () => {
    expect(normalizeWhitespace('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('parseGmailMessage', () => {
  const message = {
    id: 'abc123',
    threadId: 't1',
    internalDate: String(new Date('2026-09-10T08:00:00Z').getTime()),
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'quick preview',
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: 'Dr. Menon <menon@university.edu>' },
        { name: 'To', value: 'demo@gmail.com' },
        { name: 'Subject', value: 'Project report due Friday' },
        { name: 'Date', value: 'Thu, 10 Sep 2026 08:00:00 +0000' },
      ],
      parts: [
        { mimeType: 'text/plain', body: { data: Buffer.from('Plain body\n\nOn Mon, X wrote:\n> old').toString('base64url') } },
        { mimeType: 'text/html', body: { data: Buffer.from('<p>HTML body</p>').toString('base64url') } },
      ],
    },
  };

  it('extracts headers, sender and clean body', () => {
    const parsed = parseGmailMessage(message);
    expect(parsed.externalId).toBe('abc123');
    expect(parsed.sender).toBe('menon@university.edu');
    expect(parsed.senderName).toBe('Dr. Menon');
    expect(parsed.subject).toBe('Project report due Friday');
    expect(parsed.body).toBe('Plain body');
    expect(parsed.isRead).toBe(false);
    expect(parsed.receivedAt).toBeInstanceOf(Date);
  });

  it('falls back to HTML when no plain-text part exists', () => {
    const htmlOnly = {
      ...message,
      payload: { ...message.payload, parts: [{ mimeType: 'text/html', body: { data: Buffer.from('<p>Only HTML</p>').toString('base64url') } }] },
    };
    expect(parseGmailMessage(htmlOnly).body).toBe('Only HTML');
  });
});

describe('parseRawEmail', () => {
  it('parses headers and body of an RFC822 string', () => {
    const raw = 'From: a@b.com\nTo: c@d.com\nSubject: Hello\n\nBody line one.\n\n-- \nSignature';
    const parsed = parseRawEmail(raw, { externalId: 'raw-1' });
    expect(parsed.subject).toBe('Hello');
    expect(parsed.sender).toBe('a@b.com');
    expect(parsed.body).toBe('Body line one.');
  });
});
