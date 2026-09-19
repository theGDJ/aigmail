import { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { emailApi } from '../services/index.js';
import { useAsync, useDebounce } from '../hooks/index.js';
import { EmailListItem } from '../components/EmailListItem.jsx';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { titleCase } from '../utils/format.js';

export const Inbox = () => {
  const { meta } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { id: selectedId } = useParams();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const [filters, setFilters] = useState({
    category: '',
    priority: '',
    unreadOnly: false,
    importantOnly: false,
    actionRequired: false,
    riskOnly: false,
    sort: 'newest',
    page: 1,
  });

  const query = useMemo(() => {
    const params = { limit: 25, page: filters.page, sort: filters.sort };
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
    if (filters.category) params.category = filters.category;
    if (filters.priority) params.priority = filters.priority;
    if (filters.unreadOnly) params.unreadOnly = true;
    if (filters.importantOnly) params.importantOnly = true;
    if (filters.actionRequired) params.actionRequired = true;
    if (filters.riskOnly) params.riskOnly = true;
    return params;
  }, [debouncedSearch, filters]);

  const { data, loading, error, reload } = useAsync(() => emailApi.list(query), [JSON.stringify(query)]);

  useEffect(() => {
    const handler = () => reload().catch(() => {});
    window.addEventListener('inbox:refresh', handler);
    return () => window.removeEventListener('inbox:refresh', handler);
  }, [reload]);

  const toggleRead = async (email) => {
    try {
      await emailApi.setRead(email.id, !email.isRead);
      reload().catch(() => {});
    } catch (err) {
      toast.error(err.message);
    }
  };

  const updateFilter = (patch) => setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));

  const activeFilterCount = ['category', 'priority'].filter((k) => filters[k]).length +
    ['unreadOnly', 'importantOnly', 'actionRequired', 'riskOnly'].filter((k) => filters[k]).length;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[520px] gap-4">
      {/* List column */}
      <div className={`card flex min-w-0 flex-col ${selectedId ? 'hidden lg:flex lg:w-[420px]' : 'flex w-full'}`}>
        <div className="space-y-3 border-b border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <input
              className="input"
              placeholder="Search sender, subject or body…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="button" className="btn-ghost shrink-0 px-2.5 py-2" onClick={() => reload()} title="Refresh">
              🔄
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => updateFilter({ unreadOnly: !filters.unreadOnly })}
              className={`chip ring-1 ${filters.unreadOnly ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200'}`}
            >
              Unread
            </button>
            <button
              type="button"
              onClick={() => updateFilter({ importantOnly: !filters.importantOnly })}
              className={`chip ring-1 ${filters.importantOnly ? 'bg-amber-500 text-white ring-amber-500' : 'bg-white text-slate-600 ring-slate-200'}`}
            >
              Important
            </button>
            <button
              type="button"
              onClick={() => updateFilter({ actionRequired: !filters.actionRequired })}
              className={`chip ring-1 ${filters.actionRequired ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200'}`}
            >
              Action needed
            </button>
            <button
              type="button"
              onClick={() => updateFilter({ riskOnly: !filters.riskOnly })}
              className={`chip ring-1 ${filters.riskOnly ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white text-slate-600 ring-slate-200'}`}
            >
              Risky
            </button>
            {activeFilterCount > 0 && (
              <button
                type="button"
                className="chip bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                onClick={() =>
                  setFilters({
                    category: '',
                    priority: '',
                    unreadOnly: false,
                    importantOnly: false,
                    actionRequired: false,
                    riskOnly: false,
                    sort: 'newest',
                    page: 1,
                  })
                }
              >
                Clear ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select
              className="input py-1.5 text-xs"
              value={filters.category}
              onChange={(event) => updateFilter({ category: event.target.value })}
            >
              <option value="">All categories</option>
              {(meta.categories || []).map((category) => (
                <option key={category} value={category}>
                  {titleCase(category)}
                </option>
              ))}
            </select>
            <select
              className="input py-1.5 text-xs"
              value={filters.priority}
              onChange={(event) => updateFilter({ priority: event.target.value })}
            >
              <option value="">Any priority</option>
              {(meta.priorities || []).map((priority) => (
                <option key={priority} value={priority}>
                  {titleCase(priority)}
                </option>
              ))}
            </select>
            <select
              className="input py-1.5 text-xs"
              value={filters.sort}
              onChange={(event) => updateFilter({ sort: event.target.value })}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="unread">Unread first</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !data ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorState error={error} onRetry={() => reload()} />
            </div>
          ) : data?.items?.length ? (
            data.items.map((email) => (
              <EmailListItem key={email.id} email={email} selected={email.id === selectedId} onToggleRead={toggleRead} />
            ))
          ) : (
            <EmptyState
              title="No emails match these filters"
              description="Try clearing the filters or syncing your mailbox again."
              icon="🔍"
            />
          )}
        </div>

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>
              Page {data.page} of {data.pages} · {data.total} emails
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                disabled={data.page <= 1}
                onClick={() => updateFilter({ page: data.page - 1 })}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                disabled={data.page >= data.pages}
                onClick={() => updateFilter({ page: data.page + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {loading && data && (
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 py-1.5 text-xs text-slate-400">
            <Spinner className="h-3 w-3" /> updating…
          </div>
        )}
      </div>

      {/* Detail column */}
      <div className={`min-w-0 flex-1 overflow-y-auto ${selectedId ? 'block' : 'hidden lg:block'}`}>
        {selectedId ? (
          <Outlet context={{ onChanged: () => reload().catch(() => {}) }} />
        ) : (
          <div className="card flex h-full items-center justify-center">
            <EmptyState
              title="Select an email"
              description="Pick a message to see its AI summary, key points, action items, deadlines and priority."
              icon="🖱️"
              action={
                <button type="button" className="btn-secondary mt-2" onClick={() => navigate('/dashboard')}>
                  Back to dashboard
                </button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
