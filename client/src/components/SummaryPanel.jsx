import { useState } from 'react';
import {
  CategoryBadge,
  EngineBadge,
  ImportanceMeter,
  PriorityBadge,
  RiskBadge,
  SectionTitle,
  Spinner,
} from './ui.jsx';
import { useSpeech } from '../hooks/index.js';
import { taskApi } from '../services/index.js';
import { formatDeadline, formatDate, titleCase } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Renders the structured AI analysis of one email: summary, key points,
 * action items (interactive), deadlines, priority/category/importance and
 * the security assessment. This is the heart of the "AI productivity" UX.
 */
export const SummaryPanel = ({ email, onRegenerate, onAnalyze, regenerating = false, onTaskChanged }) => {
  const summary = email.summary;
  const { speak, stop, speaking, supported } = useSpeech();
  const toast = useToast();
  const [busyTask, setBusyTask] = useState(null);

  if (!summary) {
    return (
      <div className="card p-5">
        <SectionTitle>AI analysis</SectionTitle>
        <p className="text-sm text-slate-600">
          This email has not been analyzed yet. Generate a summary, key points, action items, deadlines,
          priority, category and importance score in one call.
        </p>
        <button type="button" className="btn-primary mt-3" onClick={onAnalyze} disabled={regenerating}>
          {regenerating ? <Spinner /> : '✨'} {regenerating ? 'Analyzing…' : 'Analyze with AI'}
        </button>
      </div>
    );
  }

  const toggleTask = async (task) => {
    setBusyTask(task.id);
    try {
      const updated = await taskApi.update(task.id, { completed: !task.completed });
      toast.success(updated.completed ? 'Task completed' : 'Task reopened');
      onTaskChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyTask(null);
    }
  };

  const spokenText = [summary.summary, ...(summary.keyPoints || [])].join('. ');

  return (
    <div className="space-y-4">
      {/* header: verdict + actions */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={summary.priority} />
          <CategoryBadge category={summary.category} />
          <RiskBadge level={summary.riskLevel} />
          <EngineBadge engine={summary.engine} />
          <span className="ml-auto text-[11px] text-slate-400">
            updated {formatDate(summary.updatedAt, { withTime: true, relative: false })}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <ImportanceMeter score={summary.importanceScore} />
          {summary.requiresReply && (
            <span className="chip bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">A reply is expected</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={onRegenerate} disabled={regenerating}>
            {regenerating ? <Spinner /> : '🔁'} Regenerate
          </button>
          {supported && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => (speaking ? stop() : speak(spokenText))}
              title="Read the summary aloud (browser text-to-speech)"
            >
              {speaking ? '⏹ Stop' : '🔊 Read summary'}
            </button>
          )}
        </div>

        {summary.importanceReasons?.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {summary.importanceReasons.map((reason) => (
              <li key={reason} className="chip bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                {reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* summary */}
      <div className="card p-5">
        <SectionTitle>Summary</SectionTitle>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{summary.summary}</p>
      </div>

      {/* key points */}
      {summary.keyPoints?.length > 0 && (
        <div className="card p-5">
          <SectionTitle>Key points</SectionTitle>
          <ul className="space-y-2">
            {summary.keyPoints.map((point, index) => (
              <li key={`${index}-${point.slice(0, 12)}`} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* action items */}
      <div className="card p-5">
        <SectionTitle>Action items</SectionTitle>
        {summary.actionItems?.length ? (
          <ul className="space-y-2">
            {summary.actionItems.map((task) => (
              <li key={task.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                  checked={task.completed}
                  disabled={busyTask === task.id}
                  onChange={() => toggleTask(task)}
                />
                <div className="min-w-0">
                  <p className={`text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {task.task}
                  </p>
                  {(task.deadline || task.dueText) && (
                    <p className="text-xs text-slate-500">
                      ⏰ {task.dueText || formatDeadline(task.deadline)}
                      {task.deadline ? ` · ${formatDate(task.deadline, { relative: false })}` : ''}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No action items were found in this email.</p>
        )}
      </div>

      {/* deadlines */}
      <div className="card p-5">
        <SectionTitle>Dates & deadlines</SectionTitle>
        {summary.deadlines?.length ? (
          <ul className="space-y-3">
            {summary.deadlines.map((deadline) => (
              <li key={deadline.id} className="flex items-start gap-3">
                <span className="chip bg-slate-100 text-slate-600 ring-1 ring-slate-200">{titleCase(deadline.type)}</span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{deadline.description}</p>
                  <p className="text-xs text-slate-500">
                    {deadline.dateText && <span className="font-semibold">{deadline.dateText}</span>}
                    {deadline.date && (
                      <>
                        {deadline.dateText ? ' · ' : ''}
                        {formatDate(deadline.date, { relative: false })} ({formatDeadline(deadline.date)})
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No deadlines were mentioned in this email.</p>
        )}
      </div>

      {/* security */}
      {['MEDIUM', 'HIGH', 'CRITICAL'].includes(summary.riskLevel) && (
        <div
          className={`card p-5 ${
            summary.riskLevel === 'CRITICAL' || summary.riskLevel === 'HIGH'
              ? 'border-rose-200 bg-rose-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <SectionTitle>Security assessment</SectionTitle>
          <p className="text-sm font-semibold text-slate-800">
            {titleCase(summary.riskLevel)} risk — verify before acting
          </p>
          <ul className="mt-2 space-y-1">
            {(summary.riskReasons || []).map((reason) => (
              <li key={reason} className="text-sm text-slate-700">
                • {reason}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-600">
            This is decision support, not proof. Nothing is deleted or blocked automatically.
          </p>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;
