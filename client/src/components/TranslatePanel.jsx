import { useState } from 'react';
import { SectionTitle, Spinner } from './ui.jsx';
import { aiApi } from '../services/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/** Translate the email and/or its summary (spec section 11). */
export const TranslatePanel = ({ email }) => {
  const { meta } = useAuth();
  const toast = useToast();
  const [targetLanguage, setTargetLanguage] = useState('HI');
  const [scope, setScope] = useState('summary');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const languages = meta.languages || [{ code: 'EN', label: 'English' }];

  const translate = async () => {
    setLoading(true);
    try {
      const data = await aiApi.translate(email.id, { targetLanguage, scope });
      setResult(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <SectionTitle>Translate</SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
          {languages
            .filter((l) => l.code !== 'EN')
            .map((language) => (
              <option key={language.code} value={language.code}>
                {language.label} {language.native !== language.label ? `· ${language.native}` : ''}
              </option>
            ))}
        </select>

        <select className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="summary">AI summary only</option>
          <option value="email">Email body only</option>
          <option value="both">Email body + summary</option>
        </select>

        <button type="button" className="btn-secondary" onClick={translate} disabled={loading}>
          {loading ? <Spinner /> : '🌐'} Translate
        </button>

        {result?.engine && (
          <span className="ml-auto text-[11px] uppercase tracking-wide text-slate-400">
            engine: {result.engine}
            {result.engine === 'local' && ' (glossary fallback — add OPENAI_API_KEY for full translation)'}
          </span>
        )}
      </div>

      {result && (
        <div className="mt-4 space-y-4">
          {result.summaryText && (
            <div>
              <p className="label">Summary ({result.targetLanguage})</p>
              <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{result.summaryText}</p>
            </div>
          )}
          {result.emailText && (
            <div>
              <p className="label">Email body ({result.targetLanguage})</p>
              <p className="max-h-72 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                {result.emailText}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TranslatePanel;
