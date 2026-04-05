import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, CheckCircle2, FileText, Info, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { getUserFacingError } from '../lib/apiErrors';
import InlineAlert from '../components/InlineAlert';
import type { Priority } from '../types';
import { useEvalContext } from '../contexts/EvalContext';
import { useFreyaMode } from '../contexts/FreyaContext';

const INS_ID_RE = /INS\d{3,}/gi;

function extractInsIds(text: string): string[] {
  const matches = text.match(INS_ID_RE) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

type ParseStatus = 'empty' | 'json_ok' | 'json_unwrapped' | 'json_partial' | 'raw_text';

function analyzeChunksText(value: string): { status: ParseStatus; chunkCount: number; insIds: string[] } {
  const trimmed = value.trim();
  if (!trimmed) return { status: 'empty', chunkCount: 0, insIds: [] };

  const insIds = extractInsIds(trimmed);

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return { status: 'json_ok', chunkCount: parsed.length, insIds };
    }
    if (typeof parsed === 'object' && parsed !== null) {
      // Check for wrapper like {"status":"success","data":[...]}
      for (const key of ['data', 'results', 'chunks', 'items', 'documents']) {
        if (Array.isArray(parsed[key])) {
          return { status: 'json_unwrapped', chunkCount: parsed[key].length, insIds };
        }
      }
      return { status: 'json_ok', chunkCount: 1, insIds };
    }
  } catch {
    // Not valid JSON — that's fine
  }

  // Try fixing escaped quotes
  if (trimmed.includes('\\"')) {
    try {
      const unescaped = trimmed.replace(/\\"/g, '"');
      const parsed = JSON.parse(unescaped);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return { status: 'json_partial', chunkCount: arr.length, insIds };
    } catch {
      // still not valid
    }
  }

  // It's just raw text — still acceptable
  return { status: 'raw_text', chunkCount: 0, insIds };
}

const STATUS_UI: Record<ParseStatus, { icon: typeof CheckCircle2; color: string; label: string } | null> = {
  empty: null,
  json_ok: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Valid JSON' },
  json_unwrapped: { icon: CheckCircle2, color: 'text-emerald-400', label: 'JSON (unwrapped from response)' },
  json_partial: { icon: Info, color: 'text-amber-400', label: 'JSON recovered (had escaped quotes)' },
  raw_text: { icon: FileText, color: 'text-blue-400', label: 'Raw text (will be used as context)' },
};

export default function NewBug() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { startEval } = useEvalContext();
  const { freya } = useFreyaMode();
  const fromId = searchParams.get('from');
  const [form, setForm] = useState({
    user_question: '',
    expected_answer: '',
    actual_answer: '',
    ins_ids: '',
    expected_ins_ids: '',
    module_name: '',
    priority: 'medium' as Priority,
    chunks_raw: '',
  });
  const [parseResult, setParseResult] = useState<{ status: ParseStatus; chunkCount: number; insIds: string[] }>({
    status: 'empty',
    chunkCount: 0,
    insIds: [],
  });
  const [insIdsManual, setInsIdsManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [prefilling, setPrefilling] = useState(!!fromId);

  useEffect(() => {
    if (!fromId) return;
    setPrefilling(true);
    api.getBug(fromId)
      .then((bug) => {
        setForm({
          user_question: bug.user_question,
          expected_answer: bug.expected_answer,
          actual_answer: bug.actual_answer,
          ins_ids: bug.ins_ids.join(', '),
          expected_ins_ids: bug.expected_ins_ids.join(', '),
          module_name: bug.module_name,
          priority: bug.priority,
          chunks_raw: bug.retrieved_chunks_raw,
        });
        if (bug.ins_ids.length) setInsIdsManual(true);
        if (bug.retrieved_chunks_raw) {
          setParseResult(analyzeChunksText(bug.retrieved_chunks_raw));
        }
      })
      .catch(() => {})
      .finally(() => setPrefilling(false));
  }, [fromId]);

  function handleChunksChange(value: string) {
    setForm((f) => ({ ...f, chunks_raw: value }));
    const result = analyzeChunksText(value);
    setParseResult(result);

    if (result.insIds.length > 0) {
      setForm((f) => {
        const currentManual = f.ins_ids
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        const currentSet = new Set(currentManual);
        const newIds = result.insIds.filter((id) => !currentSet.has(id));
        if (newIds.length > 0 || !insIdsManual) {
          const merged = insIdsManual ? [...currentManual, ...newIds] : result.insIds;
          return { ...f, ins_ids: [...new Set(merged)].join(', ') };
        }
        return f;
      });
    }
  }

  function handleInsIdsChange(value: string) {
    setInsIdsManual(value.trim().length > 0);
    setForm((f) => ({ ...f, ins_ids: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // Send raw text to backend — it handles parsing leniently
      const bug = await api.createBug({
        user_question: form.user_question,
        expected_answer: form.expected_answer,
        actual_answer: form.actual_answer,
        ins_ids: form.ins_ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        expected_ins_ids: form.expected_ins_ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        module_name: form.module_name,
        priority: form.priority,
        retrieved_chunks: [],
        retrieved_chunks_raw: form.chunks_raw,
      });
      startEval(bug.id, bug.user_question);
      navigate(`/bugs/${bug.id}`);
    } catch (err: unknown) {
      setError(getUserFacingError(err, 'Could not create this bug. Try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50';

  const statusUi = STATUS_UI[parseResult.status];

  if (prefilling) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="ml-2 text-zinc-400 text-sm">Loading bug data...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">{fromId ? 'Duplicate Bug' : 'Report a Bug'}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Question */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            User Question <span className="text-red-400">*</span>
          </label>
          <textarea
            required
            rows={2}
            className={`${inputCls} max-h-24 resize-y overflow-y-auto scrollbar-thin`}
            placeholder="What did the user ask?"
            value={form.user_question}
            onChange={(e) => setForm((f) => ({ ...f, user_question: e.target.value }))}
          />
        </div>

        {/* Expected / Actual side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Expected Answer</label>
            <textarea
              rows={3}
              className={`${inputCls} max-h-36 overflow-y-auto resize-y scrollbar-thin`}
              placeholder="What answer was expected?"
              value={form.expected_answer}
              onChange={(e) => setForm((f) => ({ ...f, expected_answer: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Actual Answer <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              className={`${inputCls} max-h-36 overflow-y-auto resize-y scrollbar-thin`}
              placeholder="What the chatbot returned"
              value={form.actual_answer}
              onChange={(e) => setForm((f) => ({ ...f, actual_answer: e.target.value }))}
            />
          </div>
        </div>

        {freya && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-zinc-300">Retrieved INS IDs</label>
                  {!insIdsManual && parseResult.insIds.length > 0 && (
                    <span className="text-xs text-indigo-400">auto-extracted</span>
                  )}
                </div>
                <input
                  className={inputCls}
                  placeholder="Auto-extracted from chunks, or type manually"
                  value={form.ins_ids}
                  onChange={(e) => handleInsIdsChange(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Expected INS IDs</label>
                <input
                  className={inputCls}
                  placeholder="e.g. INS12345, INS67890"
                  value={form.expected_ins_ids}
                  onChange={(e) => setForm((f) => ({ ...f, expected_ins_ids: e.target.value }))}
                />
                <p className="text-xs text-zinc-500 mt-1">The INS IDs where the answer should come from</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Module Name</label>
                <input
                  className={inputCls}
                  placeholder="regulations"
                  value={form.module_name}
                  onChange={(e) => setForm((f) => ({ ...f, module_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Priority</label>
                <select
                  className={inputCls}
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
          </>
        )}

        {!freya && (
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Priority</label>
            <select
              className={inputCls}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        )}

        {/* Retrieved Chunks — accepts any text */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              Retrieved Chunks / Context
            </label>
            <div className="flex items-center gap-2">
              {statusUi && (
                <span className={`flex items-center gap-1 text-xs ${statusUi.color}`}>
                  <statusUi.icon className="w-3 h-3" />
                  {statusUi.label}
                  {parseResult.chunkCount > 0 && ` \u00b7 ${parseResult.chunkCount} chunk(s)`}
                </span>
              )}
              {parseResult.insIds.length > 0 && (
                <span className="text-xs text-zinc-500">
                  {parseResult.insIds.length} INS ID(s) found
                </span>
              )}
            </div>
          </div>
          <textarea
            rows={6}
            className={`${inputCls} font-mono text-xs max-h-48 resize-y overflow-y-auto scrollbar-thin`}
            placeholder={'Paste anything here:\n• JSON array of chunks\n• API response like {"status":"success","data":[...]}\n• Raw log output with chunk text\n• Even truncated/partial JSON — we\'ll do our best to parse it'}
            value={form.chunks_raw}
            onChange={(e) => handleChunksChange(e.target.value)}
          />
          {parseResult.status === 'raw_text' && (
            <p className="text-xs text-zinc-500 mt-1">
              Could not parse as JSON — the raw text will be sent to the backend which will try harder to extract structure, or use it directly as retrieval context for evaluation.
            </p>
          )}
        </div>

        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {submitting ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit & Evaluate
        </button>
      </form>
    </div>
  );
}
