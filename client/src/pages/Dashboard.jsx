import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyticsApi, emailApi } from '../services/index.js';
import { useAsync } from '../hooks/index.js';
import { EmailListItem } from '../components/EmailListItem.jsx';
import { DigestCard } from '../components/DigestCard.jsx';
import { PriorityBars } from '../components/Charts.jsx';
import { EmptyState, ErrorState, PriorityBadge, SectionTitle, Skeleton, Spinner, StatCard } from '../components/ui.jsx';
import { formatDeadline, formatDate } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export const Dashboard = () => {
  const toast = useToast();
  const { accounts } = useAuth();
  const navigate = useNavigate();

  const analytics = useAsync(() => analyticsApi.get(14), []);
  const recent = useAsync(() => emailApi.list({ limit: 6, sort: 'newest' }), []);

  const refresh = () => {
    analytics.reload().catch(() => {});
    recent.reload().catch(() => {});
  };

  useEffect(() => {
    window.addEventListener('inbox:refresh', refresh);
    return () => window.removeEventListener('inbox:refresh', refresh);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const analyzePending = async () => {
    try {
      const result = await emailApi.analyzePending({ limit: 15 });
      toast.success(`Analyzed ${result.analyzed} of ${result.pending} pending emails`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const totals = analytics.data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {accounts.length
              ? `${accounts.map((a) => a.email).join(', ')} · last sync ${accounts[0].lastSyncedAt ? formatDate(accounts[0].lastSyncedAt) : 'never'}`
              : 'No mailbox connected yet'}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn-secondary" onClick={analyzePending} disabled={recent.loading}>
            ✨ Analyze pending
          </button>
          <Link to="/inbox" className="btn-primary">
            Open inbox
          </Link>
        </div>
      </div>

      {analytics.error && <ErrorState error={analytics.error} onRetry={() => analytics.reload()} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {analytics.loading && !totals
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card space-y-3 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))
          : [
              { label: 'Total emails', value: totals?.emails ?? 0, hint: `${totals?.analyzed ?? 0} analyzed`, icon: '📬' },
              { label: 'Unread', value: totals?.unread ?? 0, hint: `${totals?.starred ?? 0} starred`, tone: 'brand', icon: '📥' },
              { label: 'Important', value: totals?.important ?? 0, hint: `avg score ${totals?.averageImportance ?? 0}/100`, tone: 'warning', icon: '⭐' },
              { label: 'Action required', value: totals?.actionRequired ?? 0, hint: `${totals?.openTasks ?? 0} open tasks`, tone: 'danger', icon: '✅' },
            ].map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <DigestCard />

          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <SectionTitle>Recent emails</SectionTitle>
              <Link to="/inbox" className="text-xs font-semibold text-brand-600 hover:underline">
                View all
              </Link>
            </div>
            {recent.loading && !recent.data ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-5 w-5 text-slate-400" />
              </div>
            ) : recent.data?.items?.length ? (
              <div>
                {recent.data.items.map((email) => (
                  <EmailListItem key={email.id} email={email} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Your inbox is empty"
                description="Sync your mailbox to pull in recent email."
                icon="📭"
                action={
                  <Link to="/settings" className="btn-secondary mt-2">
                    Connect a mailbox
                  </Link>
                }
              />
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <SectionTitle>Priority distribution</SectionTitle>
            {analytics.data ? <PriorityBars data={analytics.data.byPriority} /> : <Skeleton className="h-40 w-full" />}
          </div>

          <div className="card p-5">
            <SectionTitle
              action={
                <Link to="/tasks" className="text-xs font-semibold text-brand-600 hover:underline">
                  All tasks
                </Link>
              }
            >
              Upcoming deadlines
            </SectionTitle>
            {analytics.data?.upcomingDeadlines?.length ? (
              <ul className="space-y-3">
                {analytics.data.upcomingDeadlines.slice(0, 5).map((deadline) => (
                  <li key={deadline.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/inbox/${deadline.emailId}`)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-brand-300"
                    >
                      <p className="text-sm font-semibold text-slate-800">{deadline.dateText || deadline.description}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {deadline.date ? `${formatDate(deadline.date, { relative: false })} · ${formatDeadline(deadline.date)}` : 'date not resolved'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{deadline.emailSubject}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-slate-500">No deadlines detected in the coming week.</p>
            )}
          </div>

          {analytics.data?.recentTasks?.length > 0 && (
            <div className="card p-5">
              <SectionTitle>Open tasks</SectionTitle>
              <ul className="space-y-2">
                {analytics.data.recentTasks.slice(0, 5).map((task) => (
                  <li key={task.id} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => navigate(`/inbox/${task.emailId}`)}
                    >
                      {task.task}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
