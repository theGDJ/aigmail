import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { emailApi } from '../services/index.js';
import { useToast } from '../context/ToastContext.jsx';
import { SectionTitle, Spinner } from '../components/ui.jsx';
import { formatDate, titleCase } from '../utils/format.js';

const TOGGLE = ({ label, hint, checked, onChange }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
    <input
      type="checkbox"
      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </span>
  </label>
);

export const Settings = () => {
  const { preference, meta, accounts, updatePreference, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (preference) setForm(preference);
  }, [preference]);

  const save = async (patch) => {
    setSaving(true);
    try {
      const updated = await updatePreference(patch);
      setForm(updated);
      toast.success('Preferences saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const reanalyze = async () => {
    setBusy('reanalyze');
    try {
      const result = await emailApi.reanalyze({ limit: 30 });
      toast.success(`Re-analyzed ${result.analyzed} of ${result.candidates} emails`);
      window.dispatchEvent(new CustomEvent('inbox:refresh'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const sync = async () => {
    setBusy('sync');
    try {
      const result = await emailApi.sync({ maxResults: 50, analyzeLimit: 15 });
      toast.success(`Synced ${result.sync.created + result.sync.updated} emails`);
      await refresh();
      window.dispatchEvent(new CustomEvent('inbox:refresh'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  if (!form) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Personal AI preferences, connected accounts and maintenance.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* AI preferences */}
        <div className="card space-y-4 p-5">
          <SectionTitle>AI preferences</SectionTitle>

          <div>
            <label className="label" htmlFor="summaryLength">
              Summary length
            </label>
            <div className="flex gap-1.5">
              {(meta.summaryLengths || []).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => save({ summaryLength: option })}
                  className={`chip ring-1 ${
                    form.summaryLength === option ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200'
                  }`}
                >
                  {titleCase(option)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Applied to new analyses. Re-analyze below to apply it to existing mail.</p>
          </div>

          <div>
            <label className="label" htmlFor="language">
              Preferred language for summaries
            </label>
            <select
              id="language"
              className="input"
              value={form.language}
              onChange={(event) => save({ language: event.target.value })}
            >
              {(meta.languages || []).map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label} {language.native !== language.label ? `· ${language.native}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="threshold">
              Notify me when importance score is at least {form.notifiedImportanceMin}/100
            </label>
            <input
              id="threshold"
              type="range"
              min="0"
              max="100"
              step="5"
              className="w-full accent-brand-600"
              value={form.notifiedImportanceMin}
              onChange={(event) => setForm({ ...form, notifiedImportanceMin: Number(event.target.value) })}
              onMouseUp={(event) => save({ notifiedImportanceMin: Number(event.target.value) })}
              onTouchEnd={(event) => save({ notifiedImportanceMin: Number(event.target.value) })}
            />
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={reanalyze}
            disabled={busy === 'reanalyze' || saving}
          >
            {busy === 'reanalyze' ? <Spinner /> : '🔁'} Re-analyze my inbox with these settings
          </button>
        </div>

        {/* Notifications & digest */}
        <div className="card space-y-3 p-5">
          <SectionTitle>Notifications & digest</SectionTitle>

          <TOGGLE
            label="Important email notifications"
            hint="Create an in-app alert when an email clears your importance threshold or looks risky."
            checked={form.notificationEnabled}
            onChange={(value) => save({ notificationEnabled: value })}
          />

          <TOGGLE
            label="Daily AI digest"
            hint="A morning summary of yesterday's inbox with top priorities and due tasks."
            checked={form.digestEnabled}
            onChange={(value) => save({ digestEnabled: value })}
          />

          <div>
            <label className="label" htmlFor="digestTime">
              Digest time
            </label>
            <input
              id="digestTime"
              type="time"
              className="input w-40"
              value={form.digestTime}
              onChange={(event) => setForm({ ...form, digestTime: event.target.value })}
              onBlur={(event) => save({ digestTime: event.target.value })}
            />
          </div>

          <TOGGLE
            label="Show phishing & spam warnings"
            hint="Display security assessment panels for suspicious email."
            checked={form.phishingWarnings}
            onChange={(value) => save({ phishingWarnings: value })}
          />

          <TOGGLE
            label="Offer voice summaries"
            hint="Enable read-aloud buttons for AI summaries (uses your browser's speech engine)."
            checked={form.voiceSummaries}
            onChange={(value) => save({ voiceSummaries: value })}
          />
        </div>

        {/* Accounts */}
        <div className="card space-y-3 p-5">
          <SectionTitle>Connected accounts</SectionTitle>

          {accounts.length === 0 && <p className="text-sm text-slate-500">No mailbox connected yet.</p>}

          <ul className="space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{account.email}</p>
                  <p className="text-xs text-slate-500">
                    {account.provider} · last sync {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : 'never'}
                  </p>
                </div>
                <span className="ml-auto chip bg-slate-100 text-slate-600 ring-1 ring-slate-200">{account.provider}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            {meta.capabilities?.googleOAuth ? (
              <a href="/auth/google" className="btn-secondary">
                🔐 Connect Gmail
              </a>
            ) : (
              <span className="text-xs text-slate-500 self-center">
                Gmail not connected - set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in server/.env to enable.
              </span>
            )}
            <button type="button" className="btn-secondary" onClick={sync} disabled={busy === 'sync'}>
              {busy === 'sync' ? <Spinner /> : '🔄'} Sync now
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Demo accounts use the local mock provider: sync works offline and sending a reply is simulated. Connect a
            real Gmail account to talk to the live Gmail API.
          </p>
        </div>

        {/* AI engine */}
        <div className="card space-y-3 p-5">
          <SectionTitle>AI engine</SectionTitle>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">
              {meta.ai?.live ? 'OpenAI (live)' : 'Local deterministic engine'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {meta.ai?.live
                ? 'Structured analysis is requested as JSON and validated before storage. Failures fall back to the local engine.'
                : 'No OPENAI_API_KEY is configured. Analysis uses the built-in rule-based engine: same input, same output, no cost and no data leaves this machine.'}
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
              prompt version: {meta.ai?.promptVersion || 'n/a'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Security posture</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Google OAuth 2.0 only — passwords are never collected.</li>
              <li>Session JWT in an httpOnly cookie, CSRF token on every mutation.</li>
              <li>Tokens, API keys and secrets never leave the server.</li>
              <li>AI output is validated against a schema before it is stored.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
