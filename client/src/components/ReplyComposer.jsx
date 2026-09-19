import { useState } from 'react';
import { Modal, SectionTitle, Spinner } from './ui.jsx';
import { aiApi, emailApi } from '../services/index.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { titleCase } from '../utils/format.js';

/**
 * "Generate Reply" feature.
 * The draft is always editable and is never sent automatically: the user has to
 * confirm sending in a separate modal (spec sections 10 + 21).
 */
export const ReplyComposer = ({ email, onSent }) => {
  const { meta } = useAuth();
  const toast = useToast();
  const [tone, setTone] = useState('PROFESSIONAL');
  const [draft, setDraft] = useState('');
  const [engine, setEngine] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const tones = meta.replyTones || ['PROFESSIONAL', 'FORMAL', 'CASUAL', 'FRIENDLY', 'SHORT'];

  const generate = async (nextTone = tone) => {
    setGenerating(true);
    try {
      const result = await aiApi.reply(email.id, { tone: nextTone });
      setDraft(result.reply);
      setEngine(result.engine);
      toast.success(`Draft generated with the ${result.engine === 'openai' ? 'OpenAI' : 'local'} engine`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const result = await emailApi.sendReply(email.id, { body: draft });
      toast.success(
        result.simulated
          ? 'Demo mode: reply recorded locally (no real mail was sent).'
          : `Reply sent to ${result.to || email.sender}`,
      );
      setConfirming(false);
      onSent?.(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-5">
      <SectionTitle>AI reply</SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        {tones.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setTone(option);
              if (draft) generate(option);
            }}
            className={`chip ring-1 transition ${
              tone === option
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {titleCase(option)}
          </button>
        ))}
        <button type="button" className="btn-primary ml-auto" onClick={() => generate()} disabled={generating}>
          {generating ? <Spinner /> : '✍️'} {draft ? 'Regenerate' : 'Generate reply'}
        </button>
      </div>

      <textarea
        className="input mt-3 min-h-[200px] font-mono text-[13px] leading-relaxed"
        placeholder="The AI draft appears here — edit it freely before sending. Nothing is sent automatically."
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={!draft} onClick={() => setConfirming(true)}>
          📤 Send reply…
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!draft}
          onClick={() => navigator.clipboard?.writeText(draft).then(() => toast.info('Draft copied to clipboard'))}
        >
          Copy
        </button>
        <button type="button" className="btn-ghost" disabled={!draft} onClick={() => setDraft('')}>
          Clear
        </button>
        {engine && (
          <span className="ml-auto text-[11px] uppercase tracking-wide text-slate-400">draft by {engine}</span>
        )}
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Send this reply?"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={sending}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={send} disabled={sending}>
              {sending ? <Spinner /> : '✅'} Confirm & send
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          To: <span className="font-semibold">{email.sender}</span>
        </p>
        <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[13px] text-slate-700">
          {draft}
        </pre>
        <p className="mt-3 text-xs text-slate-500">
          AI drafts are never sent automatically — this confirmation is the only way a reply leaves your account.
        </p>
      </Modal>
    </div>
  );
};

export default ReplyComposer;
