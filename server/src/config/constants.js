// Domain vocabulary shared by the AI layer, API validation and the client.
export const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

export const CATEGORIES = [
  'WORK',
  'EDUCATION',
  'FINANCE',
  'SHOPPING',
  'TRAVEL',
  'PERSONAL',
  'PROMOTIONS',
  'SOCIAL',
  'IMPORTANT',
  'OTHER',
];

export const DEADLINE_TYPES = ['EXPLICIT', 'MEETING', 'APPOINTMENT', 'GENERAL'];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const SUMMARY_LENGTHS = ['SHORT', 'MEDIUM', 'DETAILED'];

// Adding a language only requires a new entry here (+ a Prisma enum value).
export const LANGUAGES = [
  { code: 'EN', label: 'English', native: 'English' },
  { code: 'HI', label: 'Hindi', native: 'हिन्दी' },
  { code: 'TA', label: 'Tamil', native: 'தமிழ்' },
  { code: 'ES', label: 'Spanish', native: 'Español' },
  { code: 'FR', label: 'French', native: 'Français' },
  { code: 'DE', label: 'German', native: 'Deutsch' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export const REPLY_TONES = ['PROFESSIONAL', 'FORMAL', 'CASUAL', 'FRIENDLY', 'SHORT'];

export const SUMMARY_LENGTH_HINTS = {
  SHORT: 'at most 2 sentences (max ~40 words)',
  MEDIUM: '3-5 sentences (max ~90 words)',
  DETAILED: '1-2 paragraphs (max ~180 words) covering all relevant detail',
};

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export const PHISHING_SIGNALS = [
  'SUSPICIOUS_SENDER',
  'SUSPICIOUS_DOMAIN',
  'SUSPICIOUS_URL',
  'URGENT_PAYMENT',
  'CREDENTIAL_REQUEST',
  'SUSPICIOUS_LANGUAGE',
  'UNUSUAL_ATTACHMENT',
];

export const CATEGORY_KEYWORDS = {
  WORK: [
    'meeting', 'project', 'client', 'deadline', 'report', 'standup', 'sprint', 'manager', 'deploy',
    'team', 'review', 'interview', 'candidate', 'onboarding', 'appraisal', 'stakeholder', 'roadmap',
    'repository', 'workflow', 'build', 'release', 'pull request',
  ],
  EDUCATION: [
    'assignment', 'exam', 'semester', 'professor', 'university', 'lecture', 'grade',
    'submission', 'submit', 'course', 'thesis', 'students', 'marks', 'syllabus', 'faculty', 'department',
  ],
  FINANCE: ['invoice', 'payment', 'bank', 'transaction', 'salary', 'refund', 'statement', 'tax', 'emi', 'balance'],
  SHOPPING: ['order', 'delivery', 'shipped', 'cart', 'purchase', 'product', 'discount code', 'return'],
  TRAVEL: ['flight', 'hotel', 'booking', 'itinerary', 'train', 'visa', 'boarding', 'trip', 'reservation'],
  PERSONAL: ['family', 'birthday', 'friend', 'weekend', 'dinner', 'congratulations'],
  PROMOTIONS: ['offer', 'sale', 'unsubscribe', 'newsletter', 'deal', 'limited time', 'coupon', '% off'],
  SOCIAL: ['invitation', 'linkedin', 'follow', 'connected', 'event', 'community'],
};
