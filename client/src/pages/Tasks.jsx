import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../services/index.js';
import { useAsync } from '../hooks/index.js';
import { EmptyState, ErrorState, PriorityBadge, Skeleton, Spinner, StatCard } from '../components/ui.jsx';
import { formatDate, formatDeadline } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Completed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'all', label: 'All' },
];

export const Tasks = () => {
  const [filter, setFilter] = useState('open');
  const toast = useToast();
  const navigate = useNavigate();

  const params = useMemo(() => {
    if (filter === 'open') return { completed: false };
    if (filter === 'done') return { completed: true };
    return {};
  }, [filter]);

  const { data, loading, error, reload, setData } = useAsync(() => taskApi.list(params), [filter]);

  const tasks = useMemo(() => {
    const list = data?.tasks || [];
    if (filter !== 'overdue') return list;
    return list.filter((task) => !task.completed && task.deadline && new Date(task.deadline) < new Date());
  }, [data, filter]);

  const toggle = async (task) => {
    try {
      await taskApi.update(task.id, { completed: !task.completed });
      setData((prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)),
              stats: {
                ...prev.stats,
                open: prev.stats.open + (task.completed ? 1 : -1),
                done: prev.stats.done + (task.completed ? -1 : 1),
              },
            }
          : prev,
      );
      reload().catch(() => {});
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">Action items extracted from your email by the AI.</p>
        </div>
        <div className="ml-auto flex gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`chip ring-1 ${
                filter === option.key ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open tasks" value={data?.stats?.open ?? '—'} icon="✅" />
        <StatCard label="Completed" value={data?.stats?.done ?? '—'} tone="success" icon="🎉" />
        <StatCard label="Overdue" value={data?.stats?.overdue ?? '—'} tone="danger" icon="⏰" />
      </div>

      {error && <ErrorState error={error} onRetry={() => reload()} />}

      <div className="card divide-y divide-slate-100">
        {loading && !data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            title={filter === 'overdue' ? 'Nothing overdue' : 'No tasks here'}
            description="Tasks appear automatically when an email asks you to do something."
            icon="🗂️"
          />
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                checked={task.completed}
                onChange={() => toggle(task)}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${task.completed ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}`}>
                  {task.task}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <button
                    type="button"
                    className="truncate hover:underline"
                    onClick={() => navigate(`/inbox/${task.email.id}`)}
                  >
                    {task.email.subject} · {task.email.senderName || task.email.sender}
                  </button>
                  <span>· {formatDate(task.email.receivedAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {task.priority && <PriorityBadge priority={task.priority} />}
                {(task.deadline || task.dueText) && (
                  <span className={`text-xs ${task.deadline && new Date(task.deadline) < new Date() && !task.completed ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
                    ⏰ {task.dueText || formatDeadline(task.deadline)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {loading && data && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Spinner className="h-3 w-3" /> refreshing…
        </div>
      )}
    </div>
  );
};

export default Tasks;
