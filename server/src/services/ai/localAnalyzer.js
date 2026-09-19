// ---------------------------------------------------------------------------
// Local (deterministic) analysis engine.
//
// Used when no OpenAI key is configured and as the safety net when the model
// returns malformed JSON. It is rule-based on purpose:
//   * no network, no cost, no randomness (same input -> same output)
//   * never invents dates: absolute dates come from explicit date regexes
//   * every extractor is a pure function, so it is directly unit testable
//
// It is not a replacement for an LLM - it is the honest fallback that keeps
// every feature functional offline.
// ---------------------------------------------------------------------------
import { CATEGORY_KEYWORDS } from '../../config/constants.js';

const WORD_BOUNDARY = (word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

const WEEKDAYS = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
};

// Words that signal time pressure. Deliberately excludes bare "today" - it
// appears in ordinary prose ("today's review") and is handled as a date instead.
const URGENCY_WORDS = [
  'urgent', 'asap', 'immediately', 'action required', 'action needed', 'critical',
  'final notice', 'last chance', 'within 24 hours', 'immediate', 'high priority',
  'expires today', 'due today', 'ends today', 'last day',
];

const REPLY_PHRASES = [
  'please reply', 'kindly reply', 'please confirm', 'let me know', 'can you confirm',
  'could you', 'can you', 'please respond', 'your recommendation', 'await your response',
  'reply to this email', 'confirm the slot', 'your availability', 'please advise',
];

const ACTION_VERBS = [
  'submit', 'send', 'confirm', 'reply', 'respond', 'upload', 'prepare', 'review', 'pay',
  'complete', 'sign', 'share', 'update', 'register', 'return', 'collect', 'bring', 'book',
  'schedule', 'block', 'fix', 'document', 'add', 'fill', 'attach', 'renew', 'clear',
  'verify', 'provide', 'check', 'plan', 'finalize', 'finalise', 'report', 'deliver',
];

// Senders whose request carries more weight (work, institution, money, security).
const AUTHORITY_SENDERS = [
  'professor', 'manager', 'hr@', 'finance@', 'admin@', 'principal', 'director',
  'security@', 'billing@', 'bank', 'ir@', 'ceo', 'recruiter', 'talent',
  'university', 'faculty', 'edu', 'ac.in', 'accounts@', 'billing', 'payments',
];

const FREE_MAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'rediffmail.com'];

const SUSPICIOUS_DOMAIN_PATTERNS = [
  /verify/i, /secure[-.]?login/i, /account[-.]?(verify|update|security)/i, /login[-.]/i,
  /-secure/i, /support[-.]?\d/i, /\.(top|xyz|click|zip|buzz|info)$/i, /^xn--/i, /\d{4,}\./,
];

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------

export const normalizeText = (text = '') =>
  String(text).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();

export const splitSentences = (text = '') =>
  normalizeText(text)
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 2);

const matchAny = (text, words) => words.filter((w) => WORD_BOUNDARY(w).test(text));

// Greetings and sign-offs carry no information. They must not be summarized as
// content or mistaken for tasks ("Hi," is not an action item).
const GREETING_ONLY =
  /^(hi|hey|hello|greetings|hai|dear\s+[\w .,'-]{0,40}|good\s+(morning|afternoon|evening)|to whom it may concern)\b[\s,.!:)-]*$/i;
const SIGNOFF_ONLY =
  /^(thanks|thank you|many thanks|regards|best|best regards|kind regards|warm regards|warmly|cheers|sincerely|yours sincerely|love|take care|respectfully)\b[\s,.!:)-]*$/i;

export const isBoilerplateSentence = (sentence = '') => {
  const trimmed = String(sentence).trim();
  if (!trimmed) return true;
  if (GREETING_ONLY.test(trimmed) || SIGNOFF_ONLY.test(trimmed)) return true;
  // short fragments that open with a greeting ("Hi team,")
  return trimmed.split(/\s+/).length <= 4 && /^(hi|hey|hello|dear|greetings)\b/i.test(trimmed);
};

/** Sentences that carry actual content (greetings/sign-offs removed). */
export const contentSentences = (body = '') => splitSentences(body).filter((s) => !isBoilerplateSentence(s));

export const extractAmounts = (text = '') =>
  [...String(text).matchAll(/(?:rs\.?|inr|\$|usd|€|£)\s?\d[\d,.]*(?:\s?(?:k|lakh|crore))?/gi)].map((m) => m[0]);

// ---------------------------------------------------------------------------
// date / deadline detection
// ---------------------------------------------------------------------------

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const applyTime = (date, timeText) => {
  if (!timeText) return date;
  const m = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return date;
  let hours = Number(m[1]);
  const minutes = Number(m[2] || 0);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (!meridiem && hours <= 7) hours += 12; // "meeting at 4" almost always means 16:00
  if (hours > 23) hours = hours % 24;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
};

/**
 * Finds the first explicit date mention in a piece of text.
 * Returns { date, dateText, hasTime }. `date` is null when nothing explicit is
 * present - callers must not fabricate one.
 */
export const parseDateMention = (text = '', reference = new Date()) => {
  const source = normalizeText(text);
  const ref = new Date(reference);
  const timeMatch = source.match(/\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);

  // today / tomorrow / tonight / day after tomorrow
  const relative = source.match(/\b(today|tonight|tomorrow|day after tomorrow|this evening|next week|this weekend)\b/i);
  if (relative) {
    const word = relative[0].toLowerCase();
    let base = startOfDay(ref);
    if (word === 'tomorrow') base = new Date(base.getTime() + 86400000);
    else if (word === 'day after tomorrow') base = new Date(base.getTime() + 2 * 86400000);
    else if (word === 'next week') base = new Date(base.getTime() + 7 * 86400000);
    else if (word === 'this weekend') {
      const delta = (6 - base.getDay() + 7) % 7;
      base = new Date(base.getTime() + delta * 86400000);
    }
    return {
      date: applyTime(base, timeMatch?.[1] || (word === 'tonight' || word === 'this evening' ? '8 pm' : null)),
      dateText: relative[0],
      hasTime: Boolean(timeMatch) || word === 'tonight' || word === 'this evening',
    };
  }

  // in N days / within N weeks / in N hours
  const inNDays = source.match(/\b(?:in|within)\s+(\d{1,3})\s+(day|days|week|weeks|hour|hours)\b/i);
  if (inNDays) {
    const amount = Number(inNDays[1]);
    const unit = inNDays[2].toLowerCase();
    const ms = /^hour/.test(unit) ? amount * 3600000 : /^week/.test(unit) ? amount * 604800000 : amount * 86400000;
    return { date: new Date(ref.getTime() + ms), dateText: inNDays[0], hasTime: /^hour/.test(unit) };
  }

  // 25 August / 25 August 2026 / 25th Aug
  const dayMonth = source.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?(?:\s+(\d{4}))?\b/i,
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = MONTHS[dayMonth[2].toLowerCase()];
    let year = dayMonth[3] ? Number(dayMonth[3]) : ref.getFullYear();
    let candidate = new Date(year, month, day);
    if (!dayMonth[3] && candidate.getTime() < ref.getTime() - 30 * 86400000) {
      year += 1;
      candidate = new Date(year, month, day);
    }
    return { date: applyTime(candidate, timeMatch?.[1]), dateText: dayMonth[0], hasTime: Boolean(timeMatch) };
  }

  // August 25 / August 25, 2026
  const monthDay = source.match(
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
  );
  if (monthDay) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    const day = Number(monthDay[2]);
    let year = monthDay[3] ? Number(monthDay[3]) : ref.getFullYear();
    let candidate = new Date(year, month, day);
    if (!monthDay[3] && candidate.getTime() < ref.getTime() - 30 * 86400000) {
      year += 1;
      candidate = new Date(year, month, day);
    }
    return { date: applyTime(candidate, timeMatch?.[1]), dateText: monthDay[0], hasTime: Boolean(timeMatch) };
  }

  // 12/10 or 12/10/2026 (day first - matches the ISO-ish convention used here)
  const numeric = source.match(/\b(\d{1,2})[/](\d{1,2})(?:[/](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    if (day <= 31 && month >= 0 && month <= 11) {
      let year = numeric[3] ? Number(numeric[3]) : ref.getFullYear();
      if (year < 100) year += 2000;
      let candidate = new Date(year, month, day);
      if (!numeric[3] && candidate.getTime() < ref.getTime() - 30 * 86400000) {
        candidate = new Date(year + 1, month, day);
      }
      return { date: applyTime(candidate, timeMatch?.[1]), dateText: numeric[0], hasTime: Boolean(timeMatch) };
    }
  }

  // weekday names: Friday 5 PM, on Monday at 10 AM, next Tuesday
  const weekday = source.match(
    /\b(?:on\s+|next\s+|by\s+|before\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/i,
  );
  if (weekday) {
    const target = WEEKDAYS[weekday[1].toLowerCase()];
    const base = startOfDay(ref);
    let delta = (target - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    if (/\bnext\b/i.test(weekday[0])) delta += 7;
    const candidate = new Date(base.getTime() + delta * 86400000);
    return {
      date: applyTime(candidate, timeMatch?.[1]),
      dateText: weekday[0].trim(),
      hasTime: Boolean(timeMatch),
    };
  }

  // a bare time with no date (e.g. "the call is at 4 PM")
  if (timeMatch) {
    const candidate = applyTime(startOfDay(ref), timeMatch[1]);
    if (candidate.getTime() < ref.getTime()) candidate.setDate(candidate.getDate() + 1);
    return { date: candidate, dateText: timeMatch[1], hasTime: true };
  }

  return { date: null, dateText: null, hasTime: false };
};

// A sentence only counts as a deadline when it carries deadline language.
// Without this, ordinary prose ("the notes from today's review") produces
// phantom deadlines, which is exactly the failure mode to avoid.
const DEADLINE_LANGUAGE =
  /\b(due|duedate|deadline|last date|last day|expires?|expiry|before|by|until|no later than|on or before|overdue|submit|submission|scheduled?|meeting|appointment|call at|interview|panel|renew|renews|renewal|departure|check-?in|boarding|arrival|arrives|arriving|collect|pick ?up|payment|pay|cut-?off|closes|closing)\b/i;

const deadlineType = (sentence, dateText) => {
  const s = sentence.toLowerCase();
  if (/\b(meeting|call|standup|stand-up|review|sync|interview|panel|appointment)\b/.test(s)) {
    return /\b(appointment|doctor|dentist|clinic)\b/.test(s) ? 'APPOINTMENT' : 'MEETING';
  }
  if (/\b(due|deadline|last date|before|by)\b/.test(s)) return 'EXPLICIT';
  if (dateText) return 'GENERAL';
  return 'GENERAL';
};

export const extractDeadlines = (email) => {
  const reference = new Date(email.receivedAt || Date.now());
  const seen = new Set();
  const results = [];

  for (const sentence of contentSentences(email.body)) {
    // Require deadline language in the same sentence as the date.
    if (!DEADLINE_LANGUAGE.test(sentence)) continue;
    const { date, dateText, hasTime } = parseDateMention(sentence, reference);
    if (!dateText) continue;
    const key = `${sentence.slice(0, 60)}|${dateText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      description: sentence.length > 200 ? `${sentence.slice(0, 197)}...` : sentence,
      date: date ? date.toISOString() : null,
      dateText,
      type: deadlineType(sentence, dateText),
      hasTime,
    });
    if (results.length >= 6) break;
  }
  return results;
};

// ---------------------------------------------------------------------------
// action items
// ---------------------------------------------------------------------------

export const extractActionItems = (email) => {
  const reference = new Date(email.receivedAt || Date.now());
  const items = [];
  const seen = new Set();

  const candidates = contentSentences(email.body).filter(
    (s) => !/unsubscribe|privacy policy|view this email in your browser|no longer wish to receive/i.test(s),
  );

  for (const sentence of candidates) {
    const lower = sentence.toLowerCase();
    const requestPhrase = /\b(please|kindly|make sure|remember to|do not forget|don't forget|ensure)\b/.test(lower);
    const obligation = /\b(must|need to|needs to|have to|has to|required to|is required|are required|should)\b/.test(lower);
    const imperative = new RegExp(`^\\s*(${ACTION_VERBS.join('|')})\\b`, 'i').test(sentence);

    // "you <verb>" only counts when the verb follows "you" (a request) and is
    // not a noun ("today's review") or a gerund opener ("Sharing the notes...").
    const youThenVerb = new RegExp(`\\byou\\b[^.]{0,60}\\b(${ACTION_VERBS.join('|')})\\b`, 'i').test(lower);
    const gerundOpener = /^[A-Za-z]+ing\b/.test(sentence.trim());
    const nounUse = new RegExp(
      `\\b(the|a|an|this|that|its|their|his|her|your|today's|yesterday's)\\s+(${ACTION_VERBS.join('|')})\\b`,
      'i',
    ).test(lower);
    const youAreAsked = youThenVerb && !gerundOpener && !nounUse;

    if (!(requestPhrase || obligation || imperative || youAreAsked)) continue;
    if (sentence.length > 320) continue;

    const { date, dateText } = parseDateMention(sentence, reference);
    const taskRaw = sentence
      .replace(/^\s*(please|kindly)\s+/i, '')
      .replace(/^\s*(also|and|then|finally|additionally)\s*,?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Tasks read as list items, so start them with a capital letter.
    const task = taskRaw.charAt(0).toUpperCase() + taskRaw.slice(1);
    const key = task.toLowerCase().slice(0, 70);
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ task, deadline: date ? date.toISOString() : null, dueText: dateText });
    if (items.length >= 6) break;
  }
  return items;
};

// ---------------------------------------------------------------------------
// key points + summary
// ---------------------------------------------------------------------------

const INFO_HINTS = [
  'deadline', 'due', 'meeting', 'scheduled', 'appointment', 'invoice', 'payment', 'amount',
  'order', 'confirmed', 'approved', 'rejected', 'will', 'must', 'needs', 'requires', 'score',
  'refund', 'balance', 'shipped', 'arriving', 'released', 'available',
];

export const extractKeyPoints = (email) => {
  const sentences = contentSentences(email.body);
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let score = 0;
    if (index < 2) score += 0.55; // openings usually carry the subject
    const amountMatch = extractAmounts(sentence);
    const dateMention = parseDateMention(sentence, new Date(email.receivedAt || Date.now()));
    if (dateMention.dateText) score += 0.5;
    if (amountMatch.length) score += 0.45;
    if (matchAny(lower, INFO_HINTS).length) score += 0.4;
    if (/\d/.test(sentence)) score += 0.2;
    if (/\b(you|your|we|i)\b/.test(lower)) score += 0.1;
    if (sentence.length >= 45 && sentence.length <= 220) score += 0.2;
    if (sentence.length < 25) score -= 0.35;
    if (/unsubscribe|privacy policy|view this email/i.test(sentence)) score -= 1;
    if (/^(hi|hello|dear|greetings)\b/i.test(sentence)) score -= 0.4;
    return { sentence, index, score };
  });

  return scored
    .filter((s) => s.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .sort((a, b) => a.index - b.index)
    .map((s) => (s.sentence.length > 220 ? `${s.sentence.slice(0, 217)}...` : s.sentence));
};

const SUMMARY_SENTENCE_COUNT = { SHORT: 2, MEDIUM: 4, DETAILED: 8 };

export const summarize = (email, summaryLength = 'MEDIUM') => {
  const sentences = contentSentences(email.body).filter(
    (s) => !/unsubscribe|privacy policy|view this email in your browser/i.test(s),
  );
  if (!sentences.length) return email.subject || 'No body content to summarise.';

  const limit = SUMMARY_SENTENCE_COUNT[summaryLength] || 4;
  if (sentences.length <= limit) return sentences.join(' ');

  const dateRef = new Date(email.receivedAt || Date.now());
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let score = 0;
    if (index === 0) score += 1.2;
    if (index === 1) score += 0.6;
    if (index === sentences.length - 1) score += 0.25;
    if (parseDateMention(sentence, dateRef).dateText) score += 0.5;
    if (extractAmounts(sentence).length) score += 0.4;
    if (matchAny(lower, INFO_HINTS).length) score += 0.35;
    if (sentence.length >= 40 && sentence.length <= 240) score += 0.25;
    if (sentence.length < 20) score -= 0.4;
    if (/^(thank|thanks|regards|warmly|love|best)\b/i.test(sentence)) score -= 0.9;
    if (/^on .+wrote/i.test(sentence)) score -= 2;
    if (/^>/.test(sentence)) score -= 2;
    return { sentence, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence)
    .join(' ');
};

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

export const classifyCategory = (email) => {
  const haystack = `${email.subject}\n${email.body}`.toLowerCase();
  const scores = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      const matches = haystack.match(new RegExp(re.source, 'gi'));
      if (matches) score += matches.length * (email.subject.toLowerCase().includes(keyword) ? 2 : 1);
    }
    if (score > 0) scores[category] = score;
  }

  const domain = (email.sender || '').split('@')[1] || '';
  const localPart = (email.sender || '').split('@')[0] || '';
  if (domain.endsWith('.edu') || domain.endsWith('.ac.in')) scores.EDUCATION = (scores.EDUCATION || 0) + 5;
  if (/\b(professor|university|exam|semester|faculty|dear students|marks|hall ticket)\b/i.test(haystack)) {
    scores.EDUCATION = (scores.EDUCATION || 0) + 2;
  }
  if (/noreply|no-reply|newsletter|marketing|offers|deals|promo/i.test(localPart)) {
    // A generic no-reply address is only weak evidence of bulk mail: an
    // institution or bank can use one too. Require promo wording for the boost.
    const promoWording = /(offer|sale|deal|discount|coupon|%\s?off|limited time|unsubscribe|newsletter|watchlist)/i.test(
      haystack,
    );
    scores.PROMOTIONS = (scores.PROMOTIONS || 0) + (promoWording ? 3 : 1);
  }
  if (/linkedin|facebook|twitter|instagram|meetup|community/i.test(domain)) {
    scores.SOCIAL = (scores.SOCIAL || 0) + 3;
  }
  if (/bank|payments?|billing|finance|invoice|electricity|insurance/i.test(domain + localPart)) {
    scores.FINANCE = (scores.FINANCE || 0) + 3;
  }

  // Bulk promotional mail is identifiable by the unsubscribe footer plus an
  // offer, regardless of what the offer happens to be about (e.g. cheap flights).
  if (/(unsubscribe|opt out|no longer wish to receive)/i.test(haystack) &&
      /(offer|sale|deal|discount|coupon|%\s?off|limited time|flash sale|exclusive)/i.test(haystack)) {
    scores.PROMOTIONS = (scores.PROMOTIONS || 0) + 6;
  }
  // Developer/CI tooling mail has no domain keywords of its own.
  if (/\b(workflow|ci\b|repository|commit|pull request|build|pipeline|deploy)/i.test(haystack)) {
    scores.WORK = (scores.WORK || 0) + 2;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    if (FREE_MAIL_DOMAINS.some((d) => domain.endsWith(d))) return 'PERSONAL';
    return 'OTHER';
  }
  return ranked[0][0];
};

export const classifyPriority = (email, signals) => {
  let score = 0;
  const text = `${email.subject}\n${email.body}`.toLowerCase();
  const urgency = matchAny(text, URGENCY_WORDS);
  score += Math.min(urgency.length * 1.5, 4);

  const reference = new Date(email.receivedAt || Date.now());
  const nearest = (signals.deadlines || [])
    .map((d) => (d.date ? new Date(d.date).getTime() : null))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  if (nearest) {
    const hoursAway = (nearest - reference.getTime()) / 3600000;
    if (hoursAway < -24) score += 2; // already in the past
    else if (hoursAway <= 48) score += 3;
    else if (hoursAway <= 168) score += 2;
    else score += 1;
  }
  if ((signals.actionItems || []).length) score += 2;
  if ((signals.actionItems || []).length > 2) score += 0.5;
  // A deadline combined with required action is what makes email urgent in practice.
  if ((signals.deadlines || []).length && (signals.actionItems || []).length) score += 1.5;
  if (signals.requiresReply) score += 1;
  if (extractAmounts(text).length) score += 1;
  if (matchAny(email.sender || '', AUTHORITY_SENDERS).length) score += 1;
  if (signals.riskLevel === 'CRITICAL') score += 4;
  else if (signals.riskLevel === 'HIGH') score += 2;
  if (/\b(invoice|payment|bill)\b/.test(text)) score += 1;

  // "Urgent" must be earned: a high score alone is not enough, there has to be
  // at least one hard signal - urgency wording, a *commitment* deadline inside
  // 48 hours (a bare date mention such as "today's review" is not one), or a
  // genuine security risk.
  const commitmentNear = (signals.deadlines || []).some((d) => {
    if (!d.date) return false;
    const hoursAway = (new Date(d.date).getTime() - reference.getTime()) / 3600000;
    return d.type !== 'GENERAL' && hoursAway >= -24 && hoursAway <= 48;
  });
  const hasHardSignal =
    urgency.length > 0 || commitmentNear || ['HIGH', 'CRITICAL'].includes(signals.riskLevel);

  let priority = 'LOW';
  if (score >= 7 && hasHardSignal) priority = 'URGENT';
  else if (score >= 5) priority = 'HIGH';
  else if (score >= 2.5) priority = 'MEDIUM';

  // Bulk mail is never urgent no matter how many keywords it contains.
  if (['PROMOTIONS', 'SOCIAL'].includes(signals.category) && ['URGENT', 'HIGH'].includes(priority)) {
    priority = 'MEDIUM';
  }
  return priority;
};

export const requiresReply = (email) => {
  const text = `${email.subject}\n${email.body}`;
  const lower = text.toLowerCase();
  if (/noreply|no-reply|donotreply|do-not-reply/i.test(email.sender || '')) return false;
  if (/unsubscribe/i.test(lower) && /newsletter|offer|sale|% off/i.test(lower)) return false;
  if (matchAny(lower, REPLY_PHRASES).length) return true;
  return /\?\s*(?:\n|$)/.test(text) || /\?\s/.test(text);
};

// ---------------------------------------------------------------------------
// importance + security
// ---------------------------------------------------------------------------

export const calculateImportance = (email, signals) => {
  const reasons = [];
  let score = 18;

  const reference = new Date(email.receivedAt || Date.now());
  if (signals.deadlines?.length) {
    const nearest = signals.deadlines
      .map((d) => (d.date ? new Date(d.date).getTime() : null))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    const hoursAway = nearest ? (nearest - reference.getTime()) / 3600000 : Infinity;
    if (hoursAway < -24) {
      score += 8;
      reasons.push('Stated date has already passed');
    } else if (hoursAway <= 48) {
      score += 25;
      reasons.push('Deadline within 48 hours');
    } else if (hoursAway <= 168) {
      score += 18;
      reasons.push('Deadline within a week');
    } else {
      score += 10;
      reasons.push('Contains a deadline');
    }
  }
  if (signals.actionItems?.length) {
    score += Math.min(signals.actionItems.length * 8, 20);
    reasons.push('Requires user action');
  }
  if (signals.requiresReply) {
    score += 10;
    reasons.push('A reply is expected');
  }
  if (['WORK', 'EDUCATION', 'FINANCE', 'IMPORTANT'].includes(signals.category)) {
    score += 6;
    reasons.push(`${signals.category.toLowerCase()} related`);
  }
  const urgency = matchAny(`${email.subject} ${email.body}`.toLowerCase(), URGENCY_WORDS);
  if (urgency.length) {
    score += Math.min(urgency.length * 5, 12);
    reasons.push('Uses urgency language');
  }
  if (extractAmounts(email.body).length) {
    score += 5;
    reasons.push('Mentions a financial amount');
  }
  if (signals.toRecipientDirectly !== false) {
    score += 4;
    reasons.push('Directly addressed to the user');
  }
  if (['HIGH', 'CRITICAL'].includes(signals.riskLevel)) {
    score += 8;
    reasons.push('Flagged as a security risk');
  }
  if (signals.priority === 'LOW' && score > 60) score -= 10;
  // Newsletters, marketing and social notifications are never important mail.
  if (['PROMOTIONS', 'SOCIAL'].includes(signals.category)) score -= 22;

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons: reasons.slice(0, 5) };
};

export const detectPhishing = (email) => {
  const text = `${email.subject}\n${email.body}`;
  const lower = text.toLowerCase();
  const sender = (email.sender || '').toLowerCase();
  const domain = sender.split('@')[1] || '';
  const displayName = (email.senderName || '').toLowerCase();
  const signals = [];
  const reasons = [];

  const domainSuspicious =
    SUSPICIOUS_DOMAIN_PATTERNS.some((p) => p.test(domain)) ||
    (/\b(verify|secure|account|login|security|billing)\b/.test(displayName) && FREE_MAIL_DOMAINS.some((d) => domain.endsWith(d))) ||
    (/bank|paypal|amazon|google|microsoft|apple|netflix/.test(displayName) &&
      !/bank|paypal|amazon|google|microsoft|apple|netflix/.test(domain));
  if (domainSuspicious) {
    signals.push('SUSPICIOUS_DOMAIN');
    reasons.push(`Sender domain looks untrustworthy (${domain})`);
  }
  if (/\b(security|verify|verification|support|billing|admin|no-?reply)\b/.test(sender.split('@')[0] || '')) {
    signals.push('SUSPICIOUS_SENDER');
    reasons.push('Generic security-style sender address');
  }

  const urls = [...text.matchAll(/https?:\/\/[^\s<>")]+/gi)].map((m) => m[0]);
  const badUrl = urls.find(
    (u) => /^http:\/\//i.test(u) || /(login|verify|secure|account|update|confirm)/i.test(u) || /\d{1,3}(\.\d{1,3}){3}/.test(u),
  );
  if (badUrl) {
    signals.push('SUSPICIOUS_URL');
    reasons.push(`Suspicious link: ${badUrl.slice(0, 80)}`);
  }

  if (/\b(password|otp|one[- ]time code|cvv|card number|pin|login details|credentials|net banking)\b/.test(lower)) {
    signals.push('CREDENTIAL_REQUEST');
    reasons.push('Asks for credentials or card details');
  }
  if (
    /\b(payment|transfer|pay|wire|remit|fine|fee)\b/.test(lower) &&
    (matchAny(lower, URGENCY_WORDS).length || /\b(account (?:will be|has been) (?:suspended|blocked|closed|deactivated))\b/.test(lower))
  ) {
    signals.push('URGENT_PAYMENT');
    reasons.push('Urgent payment demand');
  }
  if (
    /\b(suspended|blocked|deactivated|legal action|permanently deleted|permanent deletion|within 24 hours|final warning|account closure)\b/.test(
      lower,
    )
  ) {
    signals.push('SUSPICIOUS_LANGUAGE');
    reasons.push('Threatening or coercive language');
  }
  if (email.hasAttachments && /\b(invoice|receipt|statement|label|shipping document)\b/.test(lower)) {
    signals.push('UNUSUAL_ATTACHMENT');
    reasons.push('Attachment attached to a financial-looking message');
  }
  // Only a genuine attachment reference counts - file extensions appear in
  // ordinary developer prose ("emailParser.test.js") and must not raise an alert.
  const mentionsAttachment = /\b(attach(ed|ment|ments)?|see the file|download the file)\b/i.test(lower);
  if (mentionsAttachment && /\.(exe|scr|bat|cmd|vbs|zip|rar)\b/i.test(lower)) {
    signals.push('UNUSUAL_ATTACHMENT');
    reasons.push('References an executable or archive attachment');
  }

  const unique = [...new Set(signals)];

  // A generic no-reply address is weak evidence; phishing warnings must require
  // real evidence so users do not learn to ignore them.
  const STRONG = ['CREDENTIAL_REQUEST', 'URGENT_PAYMENT', 'SUSPICIOUS_URL'];
  const strongCount = unique.filter((s) => STRONG.includes(s)).length;

  let risk = 'LOW';
  if (unique.includes('CREDENTIAL_REQUEST') && (unique.includes('URGENT_PAYMENT') || unique.includes('SUSPICIOUS_URL')) && unique.length >= 3) {
    risk = 'CRITICAL';
  } else if (strongCount >= 2 || unique.length >= 4) {
    risk = 'HIGH';
  } else if (strongCount >= 1 || unique.length >= 2) {
    risk = 'MEDIUM';
  }

  return { riskLevel: risk, signals: unique, reasons: reasons.slice(0, 5) };
};

// ---------------------------------------------------------------------------
// public entry point
// ---------------------------------------------------------------------------

/** Deterministic full analysis of one email. Mirrors the OpenAI output shape. */
export const analyzeLocally = (email, { summaryLength = 'MEDIUM' } = {}) => {
  const security = detectPhishing(email);
  // Security-flagged mail is by definition important; it must not be filed as
  // a promotion just because it came from a no-reply address.
  const securityFlagged = ['HIGH', 'CRITICAL'].includes(security.riskLevel);
  const category = securityFlagged ? 'IMPORTANT' : classifyCategory(email);

  // Bulk mail (newsletters, marketing, social notifications) must never create
  // tasks - a sale ending Friday is information, not work for the user.
  const bulkMail = ['PROMOTIONS', 'SOCIAL'].includes(category);
  const actionItems = bulkMail ? [] : extractActionItems(email);
  const deadlines = extractDeadlines(email);
  const needsReply = requiresReply(email);

  const baseSignals = {
    actionItems,
    deadlines,
    requiresReply: needsReply,
    category,
    riskLevel: security.riskLevel,
  };
  const priority = classifyPriority(email, baseSignals);
  const importance = calculateImportance(email, { ...baseSignals, priority });

  return {
    summary: summarize(email, summaryLength),
    key_points: extractKeyPoints(email),
    action_items: actionItems.map(({ task, dueText }) => ({ task, deadline_text: dueText ?? null })),
    deadlines: deadlines.map(({ description, dateText, type }) => ({ description, date_text: dateText, type })),
    priority,
    category,
    importance_score: importance.score,
    importance_reasons: importance.reasons,
    requires_reply: needsReply,
    reply_rationale: needsReply ? 'The sender asks the recipient a direct question or requests confirmation.' : null,
    risk_level: security.riskLevel,
    risk_reasons: security.reasons.length ? security.reasons : security.signals,
    engine: 'local',
  };
};

/** Deterministic reply draft built from the analysis (offline fallback). */
export const generateLocalReply = ({ email, analysis, tone = 'PROFESSIONAL' }) => {
  const firstName = (email.senderName || '').split(' ')[0] || 'there';
  const openers = {
    PROFESSIONAL: `Hi ${firstName},`,
    FORMAL: `Dear ${email.senderName || firstName},`,
    CASUAL: `Hi ${firstName},`,
    FRIENDLY: `Hi ${firstName}!`,
    SHORT: `Hi ${firstName},`,
  };
  const closers = {
    PROFESSIONAL: 'Best regards,\n[Your name]',
    FORMAL: 'Yours sincerely,\n[Your name]',
    CASUAL: 'Thanks,\n[Your name]',
    FRIENDLY: 'Thanks a lot,\n[Your name]',
    SHORT: 'Thanks,\n[Your name]',
  };

  const lines = [openers[tone] || openers.PROFESSIONAL, ''];

  if (tone === 'SHORT') {
    lines.push(`Thanks for the note about "${email.subject}". [Confirm what you will do] by [date].`);
    lines.push('');
    lines.push(closers.SHORT);
    return lines.join('\n');
  }

  lines.push(`Thank you for your email about "${email.subject}".`);

  const tasks = analysis?.actionItems || [];
  if (tasks.length) {
    lines.push('', 'I have noted the following items on my side:');
    for (const item of tasks.slice(0, 5)) {
      lines.push(`- ${item.task}${item.dueText ? ` (${item.dueText})` : ''}`);
    }
    lines.push('', 'I will [confirm the exact plan] and share the update by [date].');
  } else {
    lines.push('', 'I have reviewed the details you shared.');
  }

  const deadlines = analysis?.deadlines || [];
  if (deadlines.length) {
    lines.push(
      '',
      `I confirm the date${deadlines.length > 1 ? 's' : ''} mentioned: ${deadlines
        .map((d) => d.dateText || d.description.slice(0, 60))
        .join(', ')}.`,
    );
  }

  if (analysis?.requiresReply) {
    lines.push('', 'If I have misunderstood anything, please let me know and I will adjust.');
  }
  lines.push('', closers[tone] || closers.PROFESSIONAL);
  return lines.join('\n');
};

// A small glossary so the offline path can still demonstrate translation.
const GLOSSARY = {
  HI: { hello: 'नमस्ते', thanks: 'धन्यवाद', meeting: 'बैठक', deadline: 'समय-सीमा', report: 'रिपोर्ट', payment: 'भुगतान', please: 'कृपया' },
  TA: { hello: 'வணக்கம்', thanks: 'நன்றி', meeting: 'கூட்டம்', deadline: 'காலக்கெடு', report: 'அறிக்கை', payment: 'பணம் செலுத்துதல்', please: 'தயவுசெய்து' },
  ES: { hello: 'hola', thanks: 'gracias', meeting: 'reunión', deadline: 'fecha límite', report: 'informe', payment: 'pago', please: 'por favor' },
  FR: { hello: 'bonjour', thanks: 'merci', meeting: 'réunion', deadline: 'date limite', report: 'rapport', payment: 'paiement', please: "s'il vous plaît" },
  DE: { hello: 'hallo', thanks: 'danke', meeting: 'Besprechung', deadline: 'Frist', report: 'Bericht', payment: 'Zahlung', please: 'bitte' },
};

export const localTranslate = (text, targetLanguage) => {
  const glossary = GLOSSARY[targetLanguage];
  if (!glossary) return text;
  let output = text;
  for (const [word, translated] of Object.entries(glossary)) {
    output = output.replace(new RegExp(`\\b${word}\\b`, 'gi'), translated);
  }
  return output;
};

export default {
  analyzeLocally,
  isBoilerplateSentence,
  contentSentences,
  summarize,
  extractKeyPoints,
  extractActionItems,
  extractDeadlines,
  classifyPriority,
  classifyCategory,
  calculateImportance,
  detectPhishing,
  requiresReply,
  parseDateMention,
  generateLocalReply,
  localTranslate,
};
