import { useState, useRef } from 'react';
import { Upload, Play, Download } from 'lucide-react';
import { api } from '../lib/api';
import { getUserFacingError } from '../lib/apiErrors';
import InlineAlert from '../components/InlineAlert';
import type { BatchEvalResponse, BugCreate } from '../types';
import RootCauseBadge from '../components/RootCauseBadge';
import { scoreColor } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function BatchEvaluation() {
  const { preferredModel } = useAuth();
  const [jsonInput, setJsonInput] = useState('');
  const [result, setResult] = useState<BatchEvalResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setJsonInput(reader.result as string);
    reader.readAsText(file);
  }

  async function runBatch() {
    setError('');
    let bugs: BugCreate[];
    try {
      const parsed = JSON.parse(jsonInput);
      bugs = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      setError('Invalid JSON input');
      return;
    }

    setRunning(true);
    try {
      const res = await api.runBatch(bugs, preferredModel);
      setResult(res);
    } catch (err: unknown) {
      setError(getUserFacingError(err, 'Batch evaluation could not run. Try again.'));
    } finally {
      setRunning(false);
    }
  }

  function exportCsv() {
    if (!result) return;
    const headers = [
      'Index',
      'Question',
      'Faithfulness',
      'AnswerRelevancy',
      'ContextualRelevancy',
      'ContextualPrecision',
      'ContextualRecall',
      'Hallucination',
      'RootCause',
      'Status',
    ];
    const rows = result.results.map((r) => {
      const scoreMap: Record<string, number> = {};
      r.evaluation?.scores.forEach((s) => {
        scoreMap[s.name] = s.score;
      });
      return [
        r.index,
        `"${r.user_question.replace(/"/g, '""')}"`,
        scoreMap['Faithfulness'] ?? '',
        scoreMap['AnswerRelevancy'] ?? '',
        scoreMap['ContextualRelevancy'] ?? '',
        scoreMap['ContextualPrecision'] ?? '',
        scoreMap['ContextualRecall'] ?? '',
        scoreMap['Hallucination'] ?? '',
        r.evaluation?.root_cause ?? '',
        r.error ? 'ERROR' : 'OK',
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-eval-${result.batch_id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getScore(item: BatchEvalResponse['results'][0], name: string): number | null {
    const s = item.evaluation?.scores.find((s) => s.name === name);
    return s ? s.score : null;
  }

  const metrics = ['Faithfulness', 'AnswerRelevancy', 'ContextualRelevancy', 'Hallucination'];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Batch Evaluation</h1>

      {/* Input */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium"
          >
            <Upload className="w-3 h-3" />
            Upload JSON
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
          <span className="text-xs text-zinc-500">or paste JSON below</span>
        </div>
        <textarea
          rows={5}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 max-h-48 resize-y overflow-y-auto scrollbar-thin"
          placeholder='[{"user_question": "...", "actual_answer": "...", "expected_answer": "...", "retrieved_chunks": [...]}]'
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
        />
        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
        <button
          onClick={runBatch}
          disabled={running || !jsonInput.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
        >
          {running ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Run Batch Evaluation
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-semibold text-zinc-300">Results</h2>
              <span className="text-xs text-zinc-500">
                {result.completed} completed &middot; {result.failed} failed &middot; {result.total} total
              </span>
            </div>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium"
            >
              <Download className="w-3 h-3" />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 uppercase tracking-wider border-b border-zinc-700">
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">Question</th>
                  {metrics.map((m) => (
                    <th key={m} className="text-center py-2 px-2">{m.replace('Contextual', 'Ctx.')}</th>
                  ))}
                  <th className="text-center py-2 px-2">Root Cause</th>
                  <th className="text-center py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.index} className="border-b border-zinc-700">
                    <td className="py-2.5 pr-3 text-zinc-500 font-mono">{r.index + 1}</td>
                    <td className="py-2.5 pr-3 text-zinc-300 max-w-[200px] truncate">
                      {r.user_question}
                    </td>
                    {metrics.map((m) => {
                      const val = getScore(r, m);
                      return (
                        <td key={m} className="py-2.5 px-2 text-center">
                          {val != null ? (
                            <span className={`font-mono ${scoreColor(val)}`}>
                              {Math.round(val * 100)}%
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-2 text-center">
                      {r.evaluation ? (
                        <RootCauseBadge rootCause={r.evaluation.root_cause} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 text-center">
                      {r.error ? (
                        <span className="text-red-400">ERROR</span>
                      ) : (
                        <span className="text-emerald-400">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
