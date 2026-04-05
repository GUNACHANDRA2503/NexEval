import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Play, Loader2, Clipboard, Search, Filter, Check, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { BugReport } from '../types';
import RootCauseBadge from '../components/RootCauseBadge';
import { formatDate, priorityColor } from '../lib/utils';
import { useEvalContext } from '../contexts/EvalContext';

export default function BugsList() {
  const navigate = useNavigate();
  const { startEval, isRunning } = useEvalContext();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);

  const loadBugs = useCallback(() => {
    api.listBugs()
      .then(setBugs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBugs(); }, [loadBugs]);

  function handleEvaluate(bug: BugReport, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isRunning(bug.id)) return;
    startEval(bug.id, bug.user_question);
  }

  function handleCopyJson(bug: BugReport, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify({
      user_question: bug.user_question,
      expected_answer: bug.expected_answer,
      actual_answer: bug.actual_answer,
      ins_ids: bug.ins_ids,
      expected_ins_ids: bug.expected_ins_ids,
      module_name: bug.module_name,
      priority: bug.priority,
      retrieved_chunks_raw: bug.retrieved_chunks_raw,
    }, null, 2));
    setCopiedId(bug.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDeleteBug(bugId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this bug?')) return;
    await api.deleteBug(bugId);
    setBugs((prev) => prev.filter((b) => b.id !== bugId));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(bugId); return next; });
  }

  function toggleSelect(bugId: string, e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bugId)) next.delete(bugId); else next.add(bugId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((b) => b.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected bug${selectedIds.size !== 1 ? 's' : ''}?`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => api.deleteBug(id)));
      setBugs((prev) => prev.filter((b) => !selectedIds.has(b.id)));
      setSelectedIds(new Set());
      setDeleteMode(false);
    } finally {
      setDeleting(false);
    }
  }

  function exitDeleteMode() {
    setDeleteMode(false);
    setSelectedIds(new Set());
  }

  function getFaithfulness(bug: BugReport): string {
    const ev = bug.latest_evaluation;
    if (!ev || !ev.scores) return '—';
    const f = ev.scores.find((s) => s.name === 'Faithfulness');
    return f ? `${Math.round(f.score * 100)}%` : '—';
  }

  const filtered = bugs.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && b.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        b.user_question.toLowerCase().includes(q) ||
        b.module_name.toLowerCase().includes(q) ||
        b.ins_ids.some((id) => id.toLowerCase().includes(q))
      );
    }
    return true;
  });

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
          <h1 className="text-2xl font-bold">Bugs</h1>
          <p className="text-sm text-zinc-500 mt-1">{bugs.length} total bugs</p>
        </div>
        <Link
          to="/bugs/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          New Bug
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, modules, INS IDs..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="invalid">Invalid</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="all">All Priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            onClick={() => deleteMode ? exitDeleteMode() : setDeleteMode(true)}
            title={deleteMode ? 'Cancel delete' : 'Delete bugs'}
            className={`p-2 rounded-lg transition-all ${
              deleteMode
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            {deleteMode ? <X className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Bulk action bar — visible in delete mode */}
      {deleteMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <input
            type="checkbox"
            checked={filtered.length > 0 && selectedIds.size === filtered.length}
            onChange={toggleSelectAll}
            className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500/40 cursor-pointer"
          />
          <span className="text-xs text-zinc-400">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : `Select bugs to delete (${filtered.length} total)`}
          </span>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete {selectedIds.size}
            </button>
          )}
          <button
            onClick={exitDeleteMode}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Bug list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-700 rounded-xl">
          <p className="text-zinc-500 text-sm">
            {bugs.length === 0 ? 'No bugs reported yet.' : 'No bugs match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((bug) => {
            const running = isRunning(bug.id);
            const faith = getFaithfulness(bug);
            const selected = selectedIds.has(bug.id);
            return (
              <div
                key={bug.id}
                onClick={() => navigate(`/bugs/${bug.id}`)}
                className={`group flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border cursor-pointer transition-all shadow-sm hover:shadow-md ${
                  selected ? 'border-red-500/40' : 'border-zinc-700 hover:border-indigo-500/30'
                }`}
              >
                {deleteMode && (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => toggleSelect(bug.id, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500/40 cursor-pointer flex-shrink-0"
                  />
                )}
                <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                  bug.status === 'open' ? 'bg-amber-500' : bug.status === 'resolved' ? 'bg-emerald-500' : 'bg-zinc-600'
                }`} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 group-hover:text-indigo-300 transition-colors truncate font-medium">
                    {bug.user_question}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      bug.status === 'open' ? 'bg-amber-500/15 text-amber-400'
                        : bug.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-zinc-500/15 text-zinc-500'
                    }`}>
                      {bug.status}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityColor(bug.priority)}`}>
                      {bug.priority}
                    </span>
                    {bug.module_name && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-400 text-[10px] font-medium">
                        {bug.module_name}
                      </span>
                    )}
                    {bug.evaluation_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-medium">
                        {bug.evaluation_count} eval{bug.evaluation_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {bug.latest_evaluation && (
                      <RootCauseBadge rootCause={bug.latest_evaluation.root_cause} />
                    )}
                    {bug.ins_ids.length > 0 && (
                      <span className="text-[10px] text-zinc-500">{bug.ins_ids.length} INS IDs</span>
                    )}
                    <span className="text-[10px] text-zinc-500">{formatDate(bug.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {faith !== '—' && (
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Faith.</p>
                      <p className="text-sm font-mono font-bold text-zinc-300">{faith}</p>
                    </div>
                  )}
                  <button
                    onClick={(e) => handleCopyJson(bug, e)}
                    title="Copy as JSON"
                    className={`p-1.5 rounded-lg transition-all ${
                      copiedId === bug.id
                        ? 'text-emerald-500 bg-emerald-500/10 opacity-100'
                        : 'text-zinc-400 hover:text-indigo-500 hover:bg-indigo-500/10 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {copiedId === bug.id ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => handleDeleteBug(bug.id, e)}
                    title="Delete bug"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {running ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/20 text-amber-300 text-xs font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Running
                    </span>
                  ) : (
                    <button
                      onClick={(e) => handleEvaluate(bug, e)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      Evaluate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
