import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from '../components/ui.jsx';

const FEATURES = [
  ['🧠', 'Structured AI summaries', 'Short, medium or detailed summaries with key points and action items.'],
  ['⏰', 'Deadline & task extraction', 'Dates, appointments and to-dos pulled into your task list.'],
  ['🎯', 'Priority & importance', '0-100 importance score with the reasons behind it.'],
  ['🛡️', 'Phishing warnings', 'Suspicious sender, link and credential-request detection.'],
  ['🌐', 'Translation & voice', 'Six languages, plus read-aloud summaries.'],
  ['📈', 'Analytics & digest', 'Volume, categories, top senders and a daily AI digest.'],
];

export const Login = () => {
  const { isAuthenticated, demoLogin, loading } = useAuth();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    authApi.status().then(setStatus).catch(() => setStatus(null));
    const oauthError = params.get('error');
    if (oauthError) setError(`Google sign-in failed (${oauthError}). Try again or use the demo mailbox.`);
  }, [params]);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const startDemo = async () => {
    setBusy(true);
    setError('');
    try {
      await demoLogin();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-base font-bold text-white">
              AI
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">AI MAIL SUMMARIZER</h1>
              <p className="text-sm text-slate-500">Manage your inbox with AI.</p>
            </div>
          </div>

          <p className="mt-6 max-w-lg text-slate-600">
            Connect Gmail, sync your inbox and let the AI answer the questions that matter: what is this email
            about, what do I need to do, by when, how important is it — and do I need to reply?
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {status?.googleOAuthEnabled ? (
              <a href="/auth/google" className="btn-primary px-5 py-2.5">
                <span aria-hidden="true">🔐</span> Continue with Google
              </a>
            ) : (
              <button type="button" className="btn-secondary cursor-not-allowed px-5 py-2.5" disabled>
                Google sign-in not configured
              </button>
            )}

            {status?.demoLoginEnabled !== false && (
              <button type="button" className="btn-secondary px-5 py-2.5" onClick={startDemo} disabled={busy || loading}>
                {busy ? <Spinner /> : '🚀'} Continue with demo mailbox
              </button>
            )}
          </div>

          {!status?.googleOAuthEnabled && (
            <p className="mt-3 max-w-lg rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Add <code className="font-mono">GOOGLE_CLIENT_ID</code> and{' '}
              <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to <code className="font-mono">server/.env</code> to
              enable real Gmail sign-in. The demo mailbox works without any credentials.
            </p>
          )}

          {status && (
            <p className="mt-3 text-xs text-slate-500">
              AI engine: <span className="font-semibold">{status.aiProvider === 'openai' ? 'OpenAI' : 'local deterministic'}</span>
              {status.aiProvider !== 'openai' && ' (set OPENAI_API_KEY for live model analysis)'}
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>
          )}

          <p className="mt-6 text-xs text-slate-500">
            We never ask for your Gmail password. Access is granted through Google OAuth 2.0 and can be revoked at any
            time from your Google account.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(([icon, title, description]) => (
            <div key={title} className="card p-4">
              <span className="text-xl" aria-hidden="true">
                {icon}
              </span>
              <p className="mt-2 text-sm font-semibold text-slate-800">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;
