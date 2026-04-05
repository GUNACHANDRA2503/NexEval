import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useEvalContext } from '../contexts/EvalContext';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `0:${sec.toString().padStart(2, '0')}`;
}

export default function FloatingEvalTracker() {
  const { jobs, clearJob } = useEvalContext();
  const navigate = useNavigate();

  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'completed' || j.status === 'failed');

  if (activeJobs.length === 0) return null;

  const primary = activeJobs[0];

  const isRunning = primary.status === 'running';
  const isCompleted = primary.status === 'completed';

  const ringColor = isRunning ? 'border-indigo-500' : isCompleted ? 'border-emerald-500' : 'border-red-500';
  const bgColor = isRunning
    ? 'bg-indigo-950/95'
    : isCompleted
    ? 'bg-emerald-950/95'
    : 'bg-red-950/95';
  const textColor = isRunning ? 'text-indigo-200' : isCompleted ? 'text-emerald-200' : 'text-red-200';

  const usageEst = primary.estimate;
  const usageFinal = primary.usageActual ?? primary.estimate;
  const tokenLine =
    usageFinal || usageEst
      ? (() => {
          const u = isCompleted ? usageFinal : usageEst;
          if (!u) return null;
          const total = (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
          const cost = u.estimated_cost_usd ?? 0;
          return `~${total.toLocaleString()} tok · ~$${cost.toFixed(4)} est.`;
        })()
      : null;

  function handleClick() {
    navigate(`/bugs/${primary.bugId}`);
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    clearJob(primary.bugId);
  }

  return (
    <div data-theme="dark" className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Expanded card on hover */}
      <div
        onClick={handleClick}
        className={`group cursor-pointer flex items-center gap-3 rounded-2xl ${bgColor} border ${ringColor.replace('border-', 'border-')}/40 shadow-2xl px-4 py-3 min-w-[220px] transition-all hover:scale-[1.02]`}
      >
        {/* Spinner / check circle */}
        <div className="relative flex-shrink-0">
          <div className={`w-11 h-11 rounded-full border-[3px] ${ringColor} flex items-center justify-center ${isRunning ? 'animate-spin-slow' : ''}`}>
            {isRunning && (
              <div className="w-11 h-11 rounded-full border-[3px] border-transparent border-t-indigo-400 absolute inset-0 animate-spin" />
            )}
            <span className={`text-xs font-mono font-bold ${textColor} relative z-10`}>
              {formatTime(primary.elapsed)}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${textColor} truncate`}>
            {isRunning ? 'Evaluating...' : isCompleted ? 'Completed' : 'Failed'}
          </p>
          <p className="text-[10px] text-zinc-400 truncate max-w-[160px]">
            {primary.question.length > 40 ? primary.question.slice(0, 40) + '...' : primary.question}
          </p>
          {tokenLine && (
            <p className="text-[9px] text-zinc-500 font-mono mt-0.5 truncate max-w-[200px]" title="Estimated tokens and cost">
              {tokenLine}
            </p>
          )}
        </div>

        <button
          onClick={handleDismiss}
          className="p-1 rounded-full hover:bg-white/10 text-zinc-500 hover:text-zinc-200 transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Additional running jobs indicator */}
      {activeJobs.length > 1 && (
        <div className="text-[10px] text-zinc-500 pr-1">
          +{activeJobs.length - 1} more evaluation{activeJobs.length > 2 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
