import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  Play,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Clock,
  Bug,
  Activity,
  Minus,
} from 'lucide-react';
import { api } from '../lib/api';
import type { TestSuite, TestSuiteRun, TestSuiteRunResult } from '../types';
import { formatDate, priorityColor } from '../lib/utils';

export default function TestSuites() {
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadSuites = useCallback(() => {
    api.listTestSuites()
      .then(setSuites)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSuites(); }, [loadSuites]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createTestSuite({ name: newName, description: newDesc });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      loadSuites();
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this test suite?')) return;
    await api.deleteTestSuite(id).catch(() => {});
    loadSuites();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Suites</h1>
          <p className="text-sm text-zinc-500 mt-1">Regression testing for your RAG pipeline</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          New Suite
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Suite Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Regulatory Q&A Regression"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What this suite tests..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
            >
              {creating ? 'Creating...' : 'Create Suite'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {suites.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900 border border-zinc-700 rounded-xl">
          <Activity className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
          <p className="text-zinc-400 font-medium">No test suites yet</p>
          <p className="text-zinc-500 text-sm mt-1">Create a suite and add bugs to start regression testing</p>
        </div>
      ) : (
        <div className="space-y-4">
          {suites.map((suite) => (
            <SuiteCard key={suite.id} suite={suite} onDelete={handleDelete} onRefresh={loadSuites} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuiteCard({
  suite,
  onDelete,
  onRefresh,
}: {
  suite: TestSuite;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<TestSuiteRun[]>([]);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [selectedRun, setSelectedRun] = useState<TestSuiteRun | null>(null);
  const [polling, setPolling] = useState(false);

  const latestRun = suite.latest_run;
  const openCount = suite.bugs.filter((b) => b.status === 'open').length;
  const evaledCount = suite.bugs.filter((b) => (b.evaluation_count ?? 0) > 0).length;

  function handleExpand() {
    setExpanded(!expanded);
    if (!runsLoaded) {
      api.listSuiteRuns(suite.id).then((r) => {
        setRuns(r);
        setRunsLoaded(true);
      });
    }
  }

  async function handleTriggerRun() {
    setTriggering(true);
    try {
      const run = await api.triggerSuiteRun(suite.id);
      setRuns((prev) => [run, ...prev]);
      setSelectedRun(run);
      pollRun(suite.id, run.id);
    } catch { /* ignore */ }
    setTriggering(false);
  }

  function pollRun(suiteId: string, runId: string) {
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const updated = await api.getSuiteRun(suiteId, runId);
        setSelectedRun(updated);
        setRuns((prev) => prev.map((r) => (r.id === runId ? updated : r)));
        if (updated.status === 'completed' || updated.status === 'failed') {
          clearInterval(interval);
          setPolling(false);
          onRefresh();
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
      }
    }, 3000);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={handleExpand}
      >
        <div className="mt-1">
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-200">{suite.name}</h3>
            {latestRun && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                latestRun.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400'
                  : latestRun.status === 'running' ? 'bg-amber-500/15 text-amber-400'
                  : latestRun.status === 'failed' ? 'bg-red-500/15 text-red-400'
                  : 'bg-zinc-500/15 text-zinc-500'
              }`}>
                {latestRun.status === 'running' ? 'Running' : `Last: ${latestRun.status}`}
              </span>
            )}
          </div>
          {suite.description && <p className="text-xs text-zinc-500 mt-0.5">{suite.description}</p>}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Bug className="w-3 h-3" />
              <span><strong className="text-zinc-300">{suite.bug_count}</strong> bug{suite.bug_count !== 1 ? 's' : ''}</span>
              {openCount > 0 && <span className="text-amber-400">({openCount} open)</span>}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Activity className="w-3 h-3" />
              <span><strong className="text-zinc-300">{evaledCount}</strong>/{suite.bug_count} evaluated</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="w-3 h-3" />
              <span>{suite.run_count} run{suite.run_count !== 1 ? 's' : ''}</span>
            </div>
            {latestRun && latestRun.status === 'completed' && (
              <>
                {latestRun.improved > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-emerald-400">
                    <TrendingUp className="w-3 h-3" /> {latestRun.improved} improved
                  </span>
                )}
                {latestRun.regressed > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-red-400">
                    <TrendingDown className="w-3 h-3" /> {latestRun.regressed} regressed
                  </span>
                )}
                {latestRun.improved === 0 && latestRun.regressed === 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-zinc-500">
                    <Minus className="w-3 h-3" /> no change
                  </span>
                )}
              </>
            )}
            <span className="text-[10px] text-zinc-500">{formatDate(suite.created_at)}</span>
          </div>

          {/* Progress bar for running suite */}
          {latestRun && latestRun.status === 'running' && latestRun.total > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((latestRun.completed / latestRun.total) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">{latestRun.completed}/{latestRun.total} evaluated</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleTriggerRun(); }}
            disabled={triggering || polling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {triggering || polling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {polling ? `Running (${selectedRun?.completed ?? 0}/${selectedRun?.total ?? '?'})` : 'Run All'}
          </button>
          <button
            onClick={(e) => onDelete(suite.id, e)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-700 px-5 py-4 space-y-5">
          {/* Bugs table */}
          {suite.bugs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Bugs in Suite ({suite.bugs.length})</h4>
              <div className="space-y-1">
                {suite.bugs.map((b) => (
                  <div
                    key={b.bug_id}
                    onClick={() => navigate(`/bugs/${b.bug_id}`)}
                    className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg hover:bg-zinc-800/60 cursor-pointer transition-colors"
                  >
                    <div className={`w-1 h-5 rounded-full flex-shrink-0 ${
                      b.status === 'open' ? 'bg-amber-500' : b.status === 'resolved' ? 'bg-emerald-500' : 'bg-zinc-600'
                    }`} />
                    <span className="flex-1 text-zinc-300 truncate">{b.user_question || b.bug_id}</span>
                    {b.priority && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityColor(b.priority)}`}>
                        {b.priority}
                      </span>
                    )}
                    {(b.evaluation_count ?? 0) > 0 && (
                      <span className="text-[10px] text-indigo-400">{b.evaluation_count} eval{(b.evaluation_count ?? 0) !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {suite.bugs.length === 0 && (
            <div className="text-center py-6 text-zinc-500 text-sm">
              No bugs in this suite. Add bugs from the Bug Detail page.
            </div>
          )}

          {/* Run history */}
          {runs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Run History ({runs.length})</h4>
              <div className="space-y-2">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedRun?.id === run.id
                        ? 'border-indigo-500/40 bg-indigo-500/5'
                        : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {run.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
                        {run.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        {run.status === 'failed' && <XCircle className="w-3 h-3 text-red-400" />}
                        {run.status === 'pending' && <Clock className="w-3 h-3 text-zinc-500" />}
                        <span className="text-xs font-medium text-zinc-300 capitalize">{run.status}</span>
                        <span className="text-[10px] text-zinc-500">{formatDate(run.started_at)}</span>
                        {run.finished_at && (
                          <span className="text-[10px] text-zinc-500">→ {formatDate(run.finished_at)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-zinc-500">{run.completed}/{run.total} done</span>
                        {run.failed > 0 && <span className="text-red-400">{run.failed} failed</span>}
                        {run.improved > 0 && (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <TrendingUp className="w-3 h-3" /> {run.improved}
                          </span>
                        )}
                        {run.regressed > 0 && (
                          <span className="text-red-400 flex items-center gap-0.5">
                            <TrendingDown className="w-3 h-3" /> {run.regressed}
                          </span>
                        )}
                      </div>
                    </div>
                    {run.status === 'running' && run.total > 0 && (
                      <div className="mt-2">
                        <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.round((run.completed / run.total) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected run results */}
          {selectedRun && selectedRun.results.length > 0 && (
            <RunResultsTable results={selectedRun.results} />
          )}
        </div>
      )}
    </div>
  );
}

function RunResultsTable({ results }: { results: TestSuiteRunResult[] }) {
  const metricNames = [...new Set(
    results.flatMap((r) => [
      ...Object.keys(r.before || {}),
      ...Object.keys(r.after || {}),
    ]),
  )];

  return (
    <div>
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Before / After Comparison</h4>
      <div className="overflow-x-auto rounded-lg border border-zinc-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-800">
              <th className="text-left py-2.5 px-3 text-zinc-500 font-medium">Bug</th>
              {metricNames.map((m) => (
                <th key={m} className="text-center py-2.5 px-3 text-zinc-500 font-medium">{m.replace(/([a-z])([A-Z])/g, '$1 $2')}</th>
              ))}
              <th className="text-center py-2.5 px-3 text-zinc-500 font-medium">Root Cause</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              if (r.error) {
                return (
                  <tr key={i} className="border-t border-zinc-700">
                    <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[200px]">{r.user_question || r.bug_id}</td>
                    <td colSpan={metricNames.length + 1} className="py-2.5 px-3 text-red-400 text-center">{r.error}</td>
                  </tr>
                );
              }
              return (
                <tr key={i} className="border-t border-zinc-700 hover:bg-zinc-800/40">
                  <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[200px]">{r.user_question || r.bug_id}</td>
                  {metricNames.map((m) => {
                    const before = r.before?.[m];
                    const after = r.after?.[m];
                    const bPct = before != null ? Math.round(before * 100) : null;
                    const aPct = after != null ? Math.round(after * 100) : null;
                    const delta = bPct != null && aPct != null ? aPct - bPct : null;
                    return (
                      <td key={m} className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-zinc-500 font-mono">{bPct != null ? `${bPct}%` : '—'}</span>
                          <span className="text-zinc-500">→</span>
                          <span className="text-zinc-200 font-mono font-medium">{aPct != null ? `${aPct}%` : '—'}</span>
                          {delta != null && delta !== 0 && (
                            <span className={`font-mono text-[10px] ml-0.5 ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {delta > 0 ? '+' : ''}{delta}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center">
                    {r.before_root_cause !== r.after_root_cause ? (
                      <span className="text-xs">
                        <span className="text-zinc-500">{(r.before_root_cause || '—').replace(/_/g, ' ')}</span>
                        <span className="text-zinc-500 mx-1">→</span>
                        <span className="text-zinc-200">{(r.after_root_cause || '—').replace(/_/g, ' ')}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-500">{(r.after_root_cause || '—').replace(/_/g, ' ')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
