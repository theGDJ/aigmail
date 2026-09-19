// ---------------------------------------------------------------------------
// Email processing pipeline (spec section 23)
//
//  raw message -> decode -> walk MIME parts -> pick text/html -> HTML to text
//  -> strip quoted history -> strip signature -> normalize whitespace
//
// The module is intentionally pure (no I/O) so it can be unit tested and reused
// by every provider (Gmail today, Outlook later).
// ---------------------------------------------------------------------------

export const decodeBase64Url = (data = '') => {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return '';
  }
};

const decodeQuotedPrintable = (input = '') =>
  input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

// Handles the encoded-word syntax used in headers: =?UTF-8?B?...?=
export const decodeHeaderValue = (value = '') =>
  String(value).replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') return Buffer.from(text, 'base64').toString('utf8');
      return decodeQuotedPrintable(text.replace(/_/g, ' '));
    } catch {
      return text;
    }
  });

/**
 * Minimal, dependency-free HTML -> text conversion.
 * Block elements become newlines, links keep their href, entities decoded.
 */
export const htmlToText = (html = '') => {
  if (!html) return '';
  let text = html;
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');
  text = text.replace(
    /<a\b[^>]*href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, label) => `${label.trim()} (${href})`,
  );
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|blockquote)>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '- ');
  text = text.replace(/<[^>]+>/g, '');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
  return text;
};

// Removes forwarded / replied-to history so the AI only sees new content.
const QUOTE_MARKERS = [
  /^-{2,}\s*original message\s*-{2,}/im,
  /^-{2,}\s*forwarded message\s*-{2,}/im,
  /^on .{5,120}wrote:?\s*$/im,
  /^from:\s.+$/im,
  /^_{5,}\s*$/m,
  /^\s*sent from my \w+/im,
  /^\s*>{1,}\s?/m,
];

export const stripQuotedContent = (body = '') => {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (QUOTE_MARKERS.some((pattern) => pattern.test(line))) {
      // Keep everything before the marker (the new content) and drop history.
      return lines.slice(0, i).join('\n').trim();
    }
  }
  return body;
};

const SIGNATURE_MARKERS = [/^--\s*$/m, /^thanks[,!]?\s*$/im, /^regards[,!]?\s*$/im, /^best[,!]?\s*$/im];

export const stripSignature = (body = '') => {
  const lines = body.split('\n');
  // Conventional signature delimiter "-- " on its own line.
  const delimiterIndex = lines.findIndex((l) => /^--\s*$/.test(l.trim()));
  if (delimiterIndex > 0 && lines.length - delimiterIndex < 12) {
    return lines.slice(0, delimiterIndex).join('\n');
  }
  // Otherwise drop a trailing block that starts with a closing phrase and is
  // followed by short contact-detail style lines.
  for (let i = Math.max(0, lines.length - 8); i < lines.length; i += 1) {
    if (SIGNATURE_MARKERS.some((p) => p.test(lines[i].trim()))) {
      const tail = lines.slice(i + 1).filter((l) => l.trim());
      if (tail.length <= 6 && tail.every((l) => l.trim().length < 90)) {
        return lines.slice(0, i).join('\n');
      }
    }
  }
  return body;
};

export const normalizeWhitespace = (text = '') =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Full cleaning pipeline for an already-extracted body. */
export const cleanEmailBody = (body = '') =>
  normalizeWhitespace(stripSignature(stripQuotedContent(normalizeWhitespace(body))));

/** Depth-first walk over a MIME payload, splitting text and HTML parts. */
export const collectParts = (payload, acc = { text: [], html: [], attachments: 0 }) => {
  if (!payload) return acc;
  const mime = payload.mimeType || '';
  const data = payload.body?.data;
  const filename = payload.filename;

  if (filename && filename.length > 0 && !mime.startsWith('text/')) acc.attachments += 1;
  else if (filename && mime.startsWith('text/') === false) acc.attachments += 1;

  if (mime === 'text/plain' && data) acc.text.push(decodeBase64Url(data));
  else if (mime === 'text/html' && data) acc.html.push(decodeBase64Url(data));

  for (const part of payload.parts || []) collectParts(part, acc);
  return acc;
};

/**
 * Normalizes any Gmail message (already fetched in `format=full`) into the
 * internal email shape used by the rest of the application.
 */
export const parseGmailMessage = (message = {}) => {
  const headers = Object.fromEntries(
    (message.payload?.headers || []).map((h) => [h.name.toLowerCase(), decodeHeaderValue(h.value)]),
  );
  const parts = collectParts(message.payload);
  // Prefer plain text; fall back to HTML converted to text.
  const raw = parts.text.length ? parts.text.join('\n') : htmlToText(parts.html.join('\n'));
  const body = cleanEmailBody(raw);

  const fromRaw = headers.from || '';
  const nameMatch = fromRaw.match(/^\s*"?([^"<]*)"?\s*<(.+)>\s*$/);

  return {
    externalId: message.id,
    threadId: message.threadId || null,
    sender: (nameMatch?.[2] || fromRaw).trim().toLowerCase() || 'unknown@unknown',
    senderName: (nameMatch?.[1] || '').trim() || null,
    recipient: (headers.to || '').trim() || null,
    subject: (headers.subject || '(no subject)').trim(),
    body,
    snippet: (message.snippet || body.slice(0, 160)).trim(),
    receivedAt: new Date(Number(message.internalDate) || Date.now()),
    isRead: !(message.labelIds || []).includes('UNREAD'),
    isStarred: (message.labelIds || []).includes('STARRED'),
    labels: message.labelIds || [],
    hasAttachments: Boolean(
      parts.attachments || (message.payload?.parts || []).some((p) => Boolean(p.filename)),
    ),
  };
};

/** Same normalization for a raw RFC822 string (used by tests + mock provider). */
export const parseRawEmail = (raw = '', meta = {}) => {
  const [headerBlock, ...rest] = String(raw).split(/\n\s*\n/);
  const headers = Object.fromEntries(
    headerBlock
      .split('\n')
      .filter((line) => line.includes(':'))
      .map((line) => {
        const idx = line.indexOf(':');
        return [line.slice(0, idx).trim().toLowerCase(), decodeHeaderValue(line.slice(idx + 1).trim())];
      }),
  );
  const bodyRaw = rest.join('\n\n');
  const body = cleanEmailBody(
    /<html|<\/?[a-z][\s\S]*>/i.test(bodyRaw) ? htmlToText(bodyRaw) : bodyRaw,
  );
  return {
    externalId: meta.externalId || headers['message-id'] || `raw-${Date.now()}`,
    threadId: meta.threadId || null,
    sender: (headers.from || 'unknown@unknown').toLowerCase(),
    senderName: null,
    recipient: headers.to || null,
    subject: (headers.subject || '(no subject)').trim(),
    body,
    snippet: body.slice(0, 160),
    receivedAt: meta.receivedAt ? new Date(meta.receivedAt) : new Date(headers.date || Date.now()),
    isRead: meta.isRead ?? false,
    isStarred: false,
    labels: meta.labels || [],
    hasAttachments: false,
  };
};

export default {
  decodeBase64Url,
  decodeHeaderValue,
  htmlToText,
  stripQuotedContent,
  stripSignature,
  normalizeWhitespace,
  cleanEmailBody,
  collectParts,
  parseGmailMessage,
  parseRawEmail,
};
