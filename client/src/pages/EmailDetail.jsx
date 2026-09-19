import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { aiApi, emailApi } from '../services/index.js';
import { useAsync } from '../hooks/index.js';
import { SummaryPanel } from '../components/SummaryPanel.jsx';
import { ReplyComposer } from '../components/ReplyComposer.jsx';
import { TranslatePanel } from '../components/TranslatePanel.jsx';
import { ErrorState, SectionTitle, Skeleton, Spinner } from '../components/ui.jsx';
import { formatDate, initials, senderLabel } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

export const EmailDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const outlet = useOutletContext() || {};
  const [showOriginal, setShowOriginal] = useState(true);
  const [working, setWorking] = useState(false);

  const { data: email, loading, error, reload, setData } = useAsync(() => emailApi.get(id), [id]);

  // Opening an unread email marks it read (mirrors a normal mail client).
  useEffect(() => {
    if (email && !email.isRead) {
      emailApi
        .setRead(email.id, true)
        .then(() => {
          setData((prev) => (prev ? { ...prev, isRead: true } : prev));
          window.dispatchEvent(new CustomEvent('inbox:refresh'));
        })
        .catch(() => {});
    }
  }, [email, setData]);

  const runAnalysis = async (force) => {
    setWorking(true);
    try {
      const result = await aiApi.analyze(id, { force });
      toast.success(
        `Analysis ready (${result.engine === 'openai' ? 'OpenAI' : 'local engine'})` +
          (result.fallbackReason ? ` · fallback: ${result.fallbackReason}` : ''),
      );
      await reload();
      window.dispatchEvent(new CustomEvent('inbox:refresh'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWorking(false);
    }
  };

  const toggleRead = async () => {
    try {
      await emailApi.setRead(id, !email.isRead);
      await reload();
      window.dispatchEvent(new CustomEvent('inbox:refresh'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this email from the local cache? The original stays in Gmail.')) return;
    try {
      await emailApi.remove(id);
      toast.success('Email removed from this app');
      outlet.onChanged?.();
      navigate('/inbox');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading && !email) {
    return (
      <div className="card space-y-4 p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!email) return null;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {initials(senderLabel(email))}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-snug text-slate-900">{email.subject}</h1>
            <p className="mt-0.5 text-sm text-slate-600">
              <span className="font-semibold">{senderLabel(email)}</span> &lt;{email.sender}&gt;
            </p>
            {email.recipient && <p className="text-xs text-slate-500">to {email.recipient}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(email.receivedAt, { withTime: true, relative: false })}
              {email.hasAttachments && ' · 📎 has attachments'}
              {email.labels?.length > 0 && ` · ${email.labels.slice(0, 4).join(', ')}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={toggleRead}>
              {email.isRead ? 'Mark unread' : 'Mark read'}
            </button>
            <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => runAnalysis(true)} disabled={working}>
              {working ? <Spinner className="h-3 w-3" /> : '🔁'} Re-analyze
            </button>
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs text-rose-600" onClick={remove}>
              Delete
            </button>
          </div>
        </div>
      </div>

      <SummaryPanel
        email={email}
        regenerating={working}
        onAnalyze={() => runAnalysis(false)}
        onRegenerate={() => runAnalysis(true)}
        onTaskChanged={reload}
      />

      <div className="card p-5">
        <SectionTitle
          action={
            <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? 'Hide' : 'Show'}
            </button>
          }
        >
          Original email
        </SectionTitle>
        {showOriginal && (
          <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">
            {email.body || '(empty body)'}
          </pre>
        )}
      </div>

      <ReplyComposer email={email} onSent={() => outlet.onChanged?.()} />

      <TranslatePanel email={email} />
    </div>
  );
};

export default EmailDetail;
