// Presentation helpers shared by every page.

export const PRIORITY_STYLES = {
  URGENT: { chip: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200', dot: 'bg-rose-500', label: 'Urgent' },
  HIGH: { chip: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500', label: 'High' },
  MEDIUM: { chip: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500', label: 'Medium' },
  LOW: { chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200', dot: 'bg-slate-400', label: 'Low' },
};

export const RISK_STYLES = {
  LOW: { chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Low risk' },
  MEDIUM: { chip: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', label: 'Medium risk' },
  HIGH: { chip: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200', label: 'High risk' },
  CRITICAL: { chip: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200', label: 'Critical risk' },
};

export const CATEGORY_ICONS = {
  WORK: '💼',
  EDUCATION: '🎓',
  FINANCE: '💰',
  SHOPPING: '🛍️',
  TRAVEL: '✈️',
  PERSONAL: '🏠',
  PROMOTIONS: '📣',
  SOCIAL: '👥',
  IMPORTANT: '⭐',
  OTHER: '📄',
};

export const CATEGORY_COLORS = {
  WORK: '#3465f6',
  EDUCATION: '#7c3aed',
  FINANCE: '#059669',
  SHOPPING: '#db2777',
  TRAVEL: '#0891b2',
  PERSONAL: '#f59e0b',
  PROMOTIONS: '#94a3b8',
  SOCIAL: '#6366f1',
  IMPORTANT: '#dc2626',
  OTHER: '#64748b',
};

export const titleCase = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const initials = (email = '') => {
  const name = String(email).split('@')[0].replace(/[._-]+/g, ' ');
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
};

export const formatDate = (value, { withTime = false, relative = true } = {}) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffHours = diffMs / 3600000;

  if (relative && diffHours < 24 && diffHours >= 0) {
    if (diffHours < 1) {
      const minutes = Math.max(1, Math.round(diffMs / 60000));
      return `${minutes} min ago`;
    }
    return `${Math.round(diffHours)} h ago`;
  }
  if (relative && diffHours < 48 && diffHours >= 0) return 'Yesterday';

  const datePart = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  if (!withTime) return datePart;
  return `${datePart}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

/** Converts a detected deadline date into a human "in 3 days / overdue" label. */
export const formatDeadline = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays <= 7) return `In ${diffDays} days`;
  return formatDate(value, { relative: false });
};

export const senderLabel = (email) => email.senderName || email.sender;

export const truncate = (text = '', length = 140) =>
  text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;

export default {
  PRIORITY_STYLES,
  RISK_STYLES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  titleCase,
  initials,
  formatDate,
  formatDeadline,
  senderLabel,
  truncate,
};
