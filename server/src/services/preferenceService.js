// ---------------------------------------------------------------------------
// AI preferences (spec section 17): summary length, language, notifications,
// daily digest and its time, phishing warnings, voice summaries.
// ---------------------------------------------------------------------------
import prisma from '../lib/prisma.js';
import { SUMMARY_LENGTHS, LANGUAGE_CODES } from '../config/constants.js';

const DEFAULTS = {
  summaryLength: 'MEDIUM',
  language: 'EN',
  notificationEnabled: true,
  digestEnabled: true,
  digestTime: '08:00',
  timezone: 'UTC',
  phishingWarnings: true,
  voiceSummaries: false,
  notifiedImportanceMin: 80,
};

export const getPreferences = async (userId) => {
  const existing = await prisma.preference.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.preference.create({ data: { userId, ...DEFAULTS } });
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const updatePreferences = async (userId, patch) => {
  await getPreferences(userId);
  const data = {};

  if (patch.summaryLength !== undefined) {
    if (!SUMMARY_LENGTHS.includes(patch.summaryLength)) throw new Error('Invalid summaryLength');
    data.summaryLength = patch.summaryLength;
  }
  if (patch.language !== undefined) {
    if (!LANGUAGE_CODES.includes(patch.language)) throw new Error('Invalid language');
    data.language = patch.language;
  }
  if (patch.digestTime !== undefined) {
    if (!TIME_PATTERN.test(patch.digestTime)) throw new Error('digestTime must be HH:MM (24h)');
    data.digestTime = patch.digestTime;
  }
  for (const key of ['notificationEnabled', 'digestEnabled', 'phishingWarnings', 'voiceSummaries']) {
    if (patch[key] !== undefined) data[key] = Boolean(patch[key]);
  }
  if (patch.timezone !== undefined) data.timezone = String(patch.timezone).slice(0, 64);
  if (patch.notifiedImportanceMin !== undefined) {
    const value = Number(patch.notifiedImportanceMin);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('notifiedImportanceMin must be 0-100');
    data.notifiedImportanceMin = Math.round(value);
  }

  return prisma.preference.update({ where: { userId }, data });
};

export default { getPreferences, updatePreferences, DEFAULTS };
