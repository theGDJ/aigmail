import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { notificationApi, emailApi } from '../services/index.js';
import { useToast } from '../context/ToastContext.jsx';
import { initials, formatDate } from '../utils/format.js';
import { Spinner } from './ui.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/inbox', label: 'Inbox', icon: '📥' },
  { to: '/tasks', label: 'Tasks', icon: '✅' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ notifications: [], unread: 0, loading: true });
  const navigate = useNavigate();
  const toast = useToast();

  const load = async () => {
    try {
      const data = await notificationApi.list({ limit: 12 });
      setState({ ...data, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  const markAll = async () => {
    try {
      await notificationApi.readAll();
      toast.success('All notifications marked as read');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost relative px-2.5 py-2"
        aria-label="Notifications"
      >
        🔔
        {state.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {state.unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="card absolute right-0 z-20 mt-2 w-80 animate-fade-in p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Notifications</p>
              {state.unread > 0 && (
                <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={markAll}>
                  Mark all read
                </button>
              )}
            </div>
            {state.loading ? (
              <div className="flex justify-center py-6">
                <Spinner className="h-5 w-5 text-slate-400" />
              </div>
            ) : state.notifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {state.notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        await notificationApi.read(n.id).catch(() => {});
                        setOpen(false);
                        if (n.emailId) navigate(`/inbox/${n.emailId}`);
                        load();
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:border-brand-300 ${
                        n.isRead ? 'border-slate-200 bg-white' : 'border-brand-200 bg-brand-50'
                      }`}
                    >
                      <p className="font-semibold text-slate-800">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                        {formatDate(n.createdAt)} · {n.priority}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const Layout = () => {
  const { user, accounts, meta, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();
  const location = useLocation();

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await emailApi.sync({ maxResults: 40, analyzeLimit: 12 });
      toast.success(
        `Synced ${result.sync.created + result.sync.updated} emails · analyzed ${result.analysis.analyzed}`,
      );
      window.dispatchEvent(new CustomEvent('inbox:refresh'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">AI</span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-800">Mail Summarizer</p>
            <p className="text-[11px] text-slate-500">manage your inbox with AI</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mx-3 mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">AI engine</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {meta.ai?.live ? 'OpenAI ' + (meta.ai.model || '') : 'Local deterministic'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {meta.ai?.live
              ? 'Structured JSON analysis with validation.'
              : 'No OPENAI_API_KEY detected - rule-based analysis keeps every feature working.'}
          </p>
        </div>

        <div className="mx-3 mt-3 rounded-lg border border-slate-200 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Connected</p>
          <ul className="mt-1 space-y-1">
            {accounts.length === 0 && <li className="text-xs text-slate-500">No account</li>}
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="truncate">{account.email}</span>
                <span className="ml-auto rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
                  {account.provider}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button type="button" className="btn-ghost px-2 py-2 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            ☰
          </button>

          <button type="button" className="btn-secondary" onClick={sync} disabled={syncing}>
            {syncing ? <Spinner /> : '🔄'} {syncing ? 'Syncing…' : 'Sync inbox'}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <button type="button" className="btn-ghost" onClick={logout}>
              Sign out
            </button>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3">
              {user?.profileImage ? (
                <img src={user.profileImage} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {initials(user?.email || user?.name)}
                </span>
              )}
              <span className="hidden text-xs font-semibold text-slate-600 sm:block">{user?.name}</span>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
