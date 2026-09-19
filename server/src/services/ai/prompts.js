// ---------------------------------------------------------------------------
// Central AI prompt library (spec section 25).
// Prompts live here - never inline in routes or services - so they can be
// reviewed, versioned and evaluated for the research paper.
// ---------------------------------------------------------------------------
import { CATEGORIES, PRIORITIES, RISK_LEVELS, SUMMARY_LENGTH_HINTS, LANGUAGES } from '../../config/constants.js';

export const PROMPT_VERSION = '2026-09-analysis-v1';

const JSON_SHAPE = `{
  "summary": string,
  "key_points": string[],
  "action_items": [{ "task": string, "deadline_text": string|null }],
  "deadlines": [{ "description": string, "date_text": string|null, "type": "EXPLICIT"|"MEETING"|"APPOINTMENT"|"GENERAL" }],
  "priority": ${PRIORITIES.map((p) => `"${p}"`).join('|')},
  "category": ${CATEGORIES.map((c) => `"${c}"`).join('|')},
  "importance_score": number,
  "importance_reasons": string[],
  "requires_reply": boolean,
  "reply_rationale": string,
  "risk_level": ${RISK_LEVELS.map((r) => `"${r}"`).join('|')},
  "risk_reasons": string[]
}`;

export const ANALYSIS_SYSTEM_PROMPT = `You are an expert email analyst. You read a single email and return a strictly structured analysis.

Hard rules:
1. Only use information that is present in the email. Never invent facts, dates, names, amounts or action items.
2. Never invent deadlines. If a date is relative ("tomorrow", "Friday") copy the wording into *_text fields exactly as written and do not guess an absolute date.
3. Distinguish facts from interpretation: put facts in key_points, interpretations in importance_reasons.
4. Deadlines must be recorded separately from action items; an email may have either, both, or none.
5. Priority considers deadline proximity, required action, sender authority, financial content, meeting requests and urgency language.
6. importance_score is an integer between 0 and 100 and must be consistent with the listed reasons (never random).
7. requires_reply is true only when a human response is genuinely expected.
8. risk_level reflects phishing signals: suspicious sender/domain, mismatched display name, credential requests, urgent payment demands, suspicious URLs, unusual attachments, threatening language. Treat this as decision support, never as proof.
9. Return valid JSON only - no markdown fences, no commentary. Empty arrays are valid values; empty strings are not.
10. Keep the summary factual, concise and free of filler such as "This email is about".`;

export const buildAnalysisPrompt = ({ email, summaryLength = 'MEDIUM', language = 'EN' }) => {
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label || 'English';
  return `Analyse the email below.

Requirements:
- Summary length: ${SUMMARY_LENGTH_HINTS[summaryLength] || SUMMARY_LENGTH_HINTS.MEDIUM}
- Write the summary in ${languageLabel}. Keep proper nouns, dates and amounts unchanged.
- key_points: the most important information (max 6).
- action_items: tasks the recipient must do (max 6). Use an empty array when there are none.
- deadlines: dates, times, appointments and scheduled events mentioned (max 6). Use an empty array when there are none.
- importance_reasons: short phrases explaining the score (max 5).
- risk_reasons: short phrases using these signal names when applicable: SUSPICIOUS_SENDER, SUSPICIOUS_DOMAIN, SUSPICIOUS_URL, URGENT_PAYMENT, CREDENTIAL_REQUEST, SUSPICIOUS_LANGUAGE, UNUSUAL_ATTACHMENT.

Return exactly this JSON shape:
${JSON_SHAPE}

--- EMAIL METADATA ---
From: ${email.senderName ? `${email.senderName} <${email.sender}>` : email.sender}
To: ${email.recipient || 'me'}
Subject: ${email.subject}
Received: ${email.receivedAt instanceof Date ? email.receivedAt.toISOString() : email.receivedAt}
Attachments: ${email.hasAttachments ? 'yes' : 'no'}

--- EMAIL BODY ---
${(email.body || '').slice(0, 12000)}`;
};

export const buildReplySystemPrompt = () =>
  `You draft email replies. Rules:
- Never invent commitments, dates, prices or facts that are not in the original email.
- Acknowledge the key request, answer or commit only to what the user is being asked to do, and ask for clarification if the email is ambiguous.
- Keep placeholders in square brackets for anything the user must fill in themselves.
- Output plain text only: no subject line, no markdown, no signature block, no quotation of the original email.`;

export const buildReplyPrompt = ({ email, analysis, tone = 'PROFESSIONAL', language = 'EN' }) => {
  const toneHints = {
    PROFESSIONAL: 'professional and concise (about 80-120 words)',
    FORMAL: 'formal, respectful and complete (about 100-150 words)',
    CASUAL: 'casual and relaxed (about 50-80 words)',
    FRIENDLY: 'warm, friendly and helpful (about 60-100 words)',
    SHORT: 'very short - 2 or 3 sentences',
  };
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label || 'English';
  return `Draft a reply to the email below in ${languageLabel}.

Tone: ${toneHints[tone] || toneHints.PROFESSIONAL}.
${analysis?.actionItems?.length ? `The recipient still has these open tasks: ${analysis.actionItems.map((a) => a.task).join('; ')}.` : ''}
${analysis?.deadlines?.length ? `Dates mentioned: ${analysis.deadlines.map((d) => `${d.description}${d.dateText ? ` (${d.dateText})` : ''}`).join('; ')}.` : ''}

--- ORIGINAL EMAIL ---
From: ${email.senderName || email.sender}
Subject: ${email.subject}

${(email.body || '').slice(0, 8000)}`;
};

export const buildTranslationPrompt = ({ text, targetLanguage }) => {
  const label = LANGUAGES.find((l) => l.code === targetLanguage)?.label || targetLanguage;
  return `Translate the text below into ${label}. Preserve formatting, line breaks, names, dates, email addresses and numbers exactly. Return only the translated text.

--- TEXT ---
${text}`;
};

export default {
  PROMPT_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildReplySystemPrompt,
  buildReplyPrompt,
  buildTranslationPrompt,
};
