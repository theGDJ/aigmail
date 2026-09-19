import { NavLink } from 'react-router-dom';
import { CategoryBadge, PriorityBadge, RiskBadge } from './ui.jsx';
import { formatDate, initials, senderLabel, truncate } from '../utils/format.js';

export const EmailListItem = ({ email, selected = false, onToggleRead }) => {
  const preview = email.summary?.summary ? truncate(email.summary.summary, 160) : truncate(email.snippet || email.body || '', 160);

  return (
    <NavLink
      to={`/inbox/${email.id}`}
      className={`block border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 ${
        selected ? 'bg-brand-50/70' : ''
      } ${email.isRead ? '' : 'bg-white'}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
            email.isRead ? 'bg-slate-100 text-slate-500' : 'bg-brand-100 text-brand-700'
          }`}
        >
          {initials(senderLabel(email))}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={`truncate text-sm ${email.isRead ? 'text-slate-600' : 'font-bold text-slate-900'}`}>
              {senderLabel(email)}
            </p>
            {!email.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
            <span className="ml-auto shrink-0 text-xs text-slate-400">{formatDate(email.receivedAt)}</span>
          </div>

          <p className={`mt-0.5 truncate text-sm ${email.isRead ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>
            {email.subject}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{preview}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {email.summary ? (
              <>
                <PriorityBadge priority={email.summary.priority} />
                <CategoryBadge category={email.summary.category} />
                {email.summary.requiresReply && (
                  <span className="chip bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">Reply needed</span>
                )}
                {email.summary.actionItems?.length > 0 && (
                  <span className="chip bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                    {email.summary.actionItems.filter((a) => !a.completed).length} task(s)
                  </span>
                )}
                {email.summary.deadlines?.length > 0 && (
                  <span className="chip bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                    ⏰ {email.summary.deadlines[0].dateText || 'deadline'}
                  </span>
                )}
                <RiskBadge level={email.summary.riskLevel} compact />
              </>
            ) : (
              <span className="chip bg-slate-100 text-slate-500 ring-1 ring-slate-200">Not analyzed yet</span>
            )}
          </div>
        </div>

        {onToggleRead && (
          <button
            type="button"
            title={email.isRead ? 'Mark as unread' : 'Mark as read'}
            className="btn-ghost shrink-0 px-2 py-1 text-xs"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleRead(email);
            }}
          >
            {email.isRead ? '◻️' : '📩'}
          </button>
        )}
      </div>
    </NavLink>
  );
};

export default EmailListItem;
