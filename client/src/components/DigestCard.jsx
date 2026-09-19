import { useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/index.js';
import { digestApi } from '../services/index.js';
import { PriorityBadge, SectionTitle, Skeleton } from './ui.jsx';
import { formatDate } from '../utils/format.js';

export const DigestCard = ({ compact = false }) => {
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(() => digestApi.get(), []);

  if (loading) {
    return (
      <div className="card space-y-3 p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }
  if (error) return <div className="card p-5 text-sm text-slate-500">Digest unavailable: {error.message}</div>;
  if (!data) return null;

  return (
    <div className="card p-5">
      <SectionTitle action={<span className="text-[11px] text-slate-400">{formatDate(data.forDate, { relative: false })}</span>}>
        {data.greeting} · daily AI digest
      </SectionTitle>

      <p className="text-sm font-semibold text-slate-800">{data.headline}</p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="chip bg-slate-100 ring-1 ring-slate-200">{data.totals.emails} emails</span>
        {data.totals.urgent > 0 && <span className="chip bg-rose-50 text-rose-700 ring-1 ring-rose-200">{data.totals.urgent} urgent</span>}
        {data.totals.important > 0 && (
          <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200">{data.totals.important} important</span>
        )}
        {data.totals.unread > 0 && <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">{data.totals.unread} unread</span>}
      </div>

      {data.priorities?.length > 0 && (
        <div className="mt-4">
          <p className="label">Top priorities</p>
          <ol className="space-y-2">
            {data.priorities.map((item, index) => (
              <li key={item.emailId}>
                <button
                  type="button"
                  onClick={() => navigate(`/inbox/${item.emailId}`)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">{index + 1}</span>
                    <span className="truncate text-sm font-semibold text-slate-800">{item.subject}</span>
                    <span className="ml-auto shrink-0">
                      <PriorityBadge priority={item.priority} />
                    </span>
                  </div>
                  {!compact && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.summary}</p>}
                  {item.nextDeadline && <p className="mt-1 text-xs text-slate-500">⏰ {item.nextDeadline}</p>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!compact && data.tasksDue?.length > 0 && (
        <div className="mt-4">
          <p className="label">Tasks due</p>
          <ul className="space-y-1.5">
            {data.tasksDue.map((task) => (
              <li key={`${task.emailId}-${task.task.slice(0, 12)}`} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <button type="button" className="text-left hover:underline" onClick={() => navigate(`/inbox/${task.emailId}`)}>
                  {task.task}
                </button>
                {(task.dueText || task.deadline) && (
                  <span className="ml-auto shrink-0 text-xs text-slate-500">{task.dueText || formatDate(task.deadline)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.risky?.length > 0 && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200">
          ⚠ {data.risky.length} email(s) flagged as risky — review before acting.
        </p>
      )}
    </div>
  );
};

export default DigestCard;
