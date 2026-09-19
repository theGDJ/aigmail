import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../services/index.js';
import { useAsync } from '../hooks/index.js';
import { CategoryPie, PriorityBars, TopSenders, VolumeArea } from '../components/Charts.jsx';
import { ErrorState, PriorityBadge, SectionTitle, Skeleton, StatCard } from '../components/ui.jsx';
import { formatDate, formatDeadline, titleCase } from '../utils/format.js';
import { CATEGORY_ICONS } from '../utils/format.js';

const RANGES = [7, 14, 30];

export const Analytics = () => {
  const [days, setDays] = useState(14);
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => analyticsApi.get(days), [days]);

  const totals = data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500">How your inbox looks over the last {days} days.</p>
        </div>
        <div className="ml-auto flex gap-1.5">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              className={`chip ring-1 ${
                days === range ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200'
              }`}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={() => reload()} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Emails" value={totals?.emails ?? '—'} hint={`${totals?.analyzed ?? 0} analyzed`} icon="📬" />
        <StatCard label="Unread" value={totals?.unread ?? '—'} tone="brand" hint={`${totals?.starred ?? 0} starred`} icon="📥" />
        <StatCard label="Urgent" value={totals?.urgent ?? '—'} tone="danger" hint={`${totals?.risky ?? 0} risky`} icon="🚨" />
        <StatCard
          label="Avg importance"
          value={totals ? `${totals.averageImportance}/100` : '—'}
          tone="warning"
          hint={`${totals?.pendingAnalysis ?? 0} awaiting analysis`}
          icon="🎯"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <SectionTitle>Emails received per day</SectionTitle>
          {data ? <VolumeArea data={data.perDay} /> : <Skeleton className="h-56 w-full" />}
        </div>
        <div className="card p-5">
          <SectionTitle>Priority mix</SectionTitle>
          {data ? <PriorityBars data={data.byPriority} /> : <Skeleton className="h-56 w-full" />}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card p-5">
          <SectionTitle>By category</SectionTitle>
          {data ? <CategoryPie data={data.byCategory} /> : <Skeleton className="h-56 w-full" />}
        </div>

        <div className="card p-5">
          <SectionTitle>Most frequent senders</SectionTitle>
          {data ? <TopSenders data={data.topSenders} /> : <Skeleton className="h-40 w-full" />}
        </div>

        <div className="card p-5">
          <SectionTitle>Category breakdown</SectionTitle>
          <ul className="space-y-2">
            {Object.entries(data?.byCategory || {}).map(([category, count]) => (
              <li key={category} className="flex items-center gap-2 text-sm text-slate-700">
                <span aria-hidden="true">{CATEGORY_ICONS[category] || '📄'}</span>
                <span>{titleCase(category)}</span>
                <span className="ml-auto font-semibold">{count}</span>
                <span className="w-16 text-right text-xs text-slate-400">
                  {totals?.emails ? `${Math.round((count / totals.emails) * 100)}%` : '0%'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card p-5">
        <SectionTitle>Upcoming deadlines (next 7 days)</SectionTitle>
        {loading && !data ? (
          <Skeleton className="h-32 w-full" />
        ) : data?.upcomingDeadlines?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">When</th>
                  <th className="py-2 pr-4 font-semibold">What</th>
                  <th className="py-2 pr-4 font-semibold">Type</th>
                  <th className="py-2 font-semibold">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.upcomingDeadlines.map((deadline) => (
                  <tr key={deadline.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 align-top">
                      <span className="font-semibold text-slate-700">{deadline.dateText || '—'}</span>
                      <span className="block text-xs text-slate-500">
                        {deadline.date ? `${formatDate(deadline.date, { relative: false })} · ${formatDeadline(deadline.date)}` : ''}
                      </span>
                    </td>
                    <td className="max-w-sm py-2 pr-4 align-top text-slate-700">{deadline.description}</td>
                    <td className="py-2 pr-4 align-top">
                      <span className="chip bg-slate-100 text-slate-600 ring-1 ring-slate-200">{titleCase(deadline.type)}</span>
                    </td>
                    <td className="py-2 align-top">
                      <button
                        type="button"
                        className="text-left text-brand-600 hover:underline"
                        onClick={() => navigate(`/inbox/${deadline.emailId}`)}
                      >
                        {deadline.emailSubject}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-sm text-slate-500">No deadlines detected in the next week.</p>
        )}
      </div>

      {data?.recentTasks?.length > 0 && (
        <div className="card p-5">
          <SectionTitle>Open action items</SectionTitle>
          <ul className="space-y-2">
            {data.recentTasks.map((task) => (
              <li key={task.id} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span className="flex-1">{task.task}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-brand-600 hover:underline"
                  onClick={() => navigate(`/inbox/${task.emailId}`)}
                >
                  open email
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.recentTasks?.length === 0 && null}

      {data?.upcomingDeadlines?.some((d) => d.date) && (
        <p className="text-xs text-slate-400">
          Deadline dates are resolved from text that is explicitly present in the email — never invented.
        </p>
      )}
    </div>
  );
};

export default Analytics;
