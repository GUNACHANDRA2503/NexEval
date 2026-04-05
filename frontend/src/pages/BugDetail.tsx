import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Lightbulb,
  MessageSquare,
  CheckCircle2,
  XCircle,
  History,
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  Check,
  Info,
  Pencil,
  Save,
  X,
  FileText,
  AlertTriangle,
  Clipboard,
  CopyPlus,
  FlaskConical,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  BugReport,
  BugUpdate,
  RetrievedChunk,
  EvaluationResult,
  EvaluationHistoryItem,
  RephraseResponse,
  Priority,
} from '../types';
import ScoreBar from '../components/ScoreBar';
import RootCauseBadge from '../components/RootCauseBadge';
import { formatDate, priorityColor } from '../lib/utils';
import { useEvalContext } from '../contexts/EvalContext';
import { useFreyaMode } from '../contexts/FreyaContext';

type Tab = 'evaluation' | 'chunks' | 'rephrase';

interface Toast {
  type: 'success' | 'error' | 'info';
  message: string;
}

type ParsedChunk =
  | { type: 'structured'; title: string; content: string[]; meta: Record<string, string> }
  | { type: 'json'; data: unknown }
  | { type: 'text'; text: string };

function parseChunkText(raw: string): ParsedChunk {
  const cleaned = raw
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\r/g, '');

  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  let obj = tryParse(cleaned);
  if (!obj) {
    const arrStart = cleaned.indexOf('[');
    const objStart = cleaned.indexOf('{');
    const start = arrStart >= 0 && objStart >= 0 ? Math.min(arrStart, objStart) : Math.max(arrStart, objStart);
    if (start >= 0) obj = tryParse(cleaned.slice(start));
  }
  if (!obj && cleaned.includes('"output"')) {
    const m = cleaned.match(/"output"\s*:\s*"(.+)"/s);
    if (m) obj = tryParse(m[1].replace(/\\"/g, '"'));
  }
  // Unwrap string-valued wrappers: "output"/"response"/"result"/"body" keys containing JSON strings
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const key of ['output', 'response', 'result', 'body']) {
      const val = (obj as Record<string, unknown>)[key];
      if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
        const inner = tryParse(val);
        if (inner) { obj = inner; break; }
      }
    }
  }

  if (obj) {
    const items = obj?.data || obj?.results || (Array.isArray(obj) ? obj : [obj]);
    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      if (first && typeof first === 'object') {
        const title = first.metadata?.title || first.title || '';
        const contentChunks: string[] = [];
        const metaChunks = first.metadata?.chunks || first.chunks || [];
        if (Array.isArray(metaChunks)) {
          for (const mc of metaChunks) {
            if (mc?.content && Array.isArray(mc.content)) {
              contentChunks.push(...mc.content);
            }
          }
        }
        if (contentChunks.length > 0 || title) {
          const meta: Record<string, string> = {};
          if (first.metadata?.attachment_name) meta['File'] = first.metadata.attachment_name;
          if (first.metadata?.release_date) meta['Released'] = first.metadata.release_date.split('T')[0];
          if (first.metadata?.countries?.length) meta['Countries'] = first.metadata.countries.slice(0, 5).join(', ');
          if (first.metadata?.ref_url?.length) meta['URL'] = first.metadata.ref_url[0];
          return { type: 'structured', title, content: contentChunks, meta };
        }
      }
    }
    return { type: 'json', data: obj };
  }

  return { type: 'text', text: cleaned || raw };
}

function JsonNode({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);
  const indent = depth * 12;

  if (data === null) return <span className="text-orange-400">null</span>;
  if (typeof data === 'boolean') return <span className="text-orange-400">{String(data)}</span>;
  if (typeof data === 'number') return <span className="text-amber-300">{data}</span>;
  if (typeof data === 'string') {
    if (data.length > 300) {
      return <span className="text-emerald-300">"{data.slice(0, 300)}..."</span>;
    }
    return <span className="text-emerald-300">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-zinc-500">[]</span>;
    if (collapsed) {
      return (
        <span>
          <button onClick={() => setCollapsed(false)} className="text-zinc-500 hover:text-zinc-300">[{data.length} items...]</button>
        </span>
      );
    }
    return (
      <span>
        <button onClick={() => setCollapsed(true)} className="text-zinc-500 hover:text-zinc-300">[</button>
        {data.map((item, i) => (
          <div key={i} style={{ paddingLeft: indent + 12 }}>
            <JsonNode data={item} depth={depth + 1} />
            {i < data.length - 1 && <span className="text-zinc-500">,</span>}
          </div>
        ))}
        <div style={{ paddingLeft: indent }}>]</div>
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-zinc-500">{'{}'}</span>;
    if (collapsed) {
      return (
        <span>
          <button onClick={() => setCollapsed(false)} className="text-zinc-500 hover:text-zinc-300">{'{'}{entries.length} keys...{'}'}</button>
        </span>
      );
    }
    return (
      <span>
        <button onClick={() => setCollapsed(true)} className="text-zinc-500 hover:text-zinc-300">{'{'}</button>
        {entries.map(([key, val], i) => (
          <div key={key} style={{ paddingLeft: indent + 12 }}>
            <span className="text-indigo-300">"{key}"</span>
            <span className="text-zinc-500">: </span>
            <JsonNode data={val} depth={depth + 1} />
            {i < entries.length - 1 && <span className="text-zinc-500">,</span>}
          </div>
        ))}
        <div style={{ paddingLeft: indent }}>{'}'}</div>
      </span>
    );
  }

  return <span className="text-zinc-400">{String(data)}</span>;
}

function FormattedChunkContent({ text, isExpected }: { text: string; isExpected: boolean }) {
  const parsed = parseChunkText(text);
  const base = isExpected
    ? 'bg-emerald-500/10 border border-emerald-500/20 text-zinc-300'
    : 'bg-zinc-800 border border-zinc-700 text-zinc-300';

  if (parsed.type === 'structured') {
    return (
      <div className={`rounded-lg p-3 mb-2 text-xs leading-relaxed ${base}`}>
        {parsed.title && (
          <p className="font-semibold text-zinc-200 mb-2">{parsed.title}</p>
        )}
        {Object.keys(parsed.meta).length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-[10px] text-zinc-500">
            {Object.entries(parsed.meta).map(([k, v]) => (
              <span key={k}>{k}: <span className="text-zinc-400">{v}</span></span>
            ))}
          </div>
        )}
        {parsed.content.map((c, i) => (
          <div key={i} className="mb-2 last:mb-0">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold">Passage {i + 1}</span>
            <p className="whitespace-pre-wrap mt-1">{c}</p>
          </div>
        ))}
      </div>
    );
  }

  if (parsed.type === 'json') {
    return (
      <div className={`rounded-lg p-3 mb-2 text-xs leading-relaxed font-mono ${base} max-h-96 overflow-y-auto`}>
        <JsonNode data={parsed.data} depth={0} />
      </div>
    );
  }

  return (
    <div className={`rounded-lg p-3 mb-2 text-xs leading-relaxed ${base}`}>
      <p className="whitespace-pre-wrap">{parsed.text}</p>
    </div>
  );
}

function EvalDiffView({ history }: { history: EvaluationHistoryItem[] }) {
  const [runA, setRunA] = useState<number>(history.length > 1 ? history[1].run_number : history[0]?.run_number ?? 0);
  const [runB, setRunB] = useState<number>(history[0]?.run_number ?? 0);

  const a = history.find((h) => h.run_number === runA);
  const b = history.find((h) => h.run_number === runB);

  if (!a || !b) return null;

  const allMetrics = [...new Set([...a.scores.map((s) => s.name), ...b.scores.map((s) => s.name)])];

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-zinc-300">Run Comparison</h3>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-zinc-500">Run A:</label>
          <select
            value={runA}
            onChange={(e) => setRunA(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            {history.map((h) => (
              <option key={h.run_number} value={h.run_number}>#{h.run_number}</option>
            ))}
          </select>
          <label className="text-zinc-500">Run B:</label>
          <select
            value={runB}
            onChange={(e) => setRunB(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            {history.map((h) => (
              <option key={h.run_number} value={h.run_number}>#{h.run_number}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {allMetrics.map((name) => {
          const scoreA = a.scores.find((s) => s.name === name);
          const scoreB = b.scores.find((s) => s.name === name);
          const valA = scoreA ? Math.round(scoreA.score * 100) : null;
          const valB = scoreB ? Math.round(scoreB.score * 100) : null;
          const delta = valA != null && valB != null ? valB - valA : null;
          return (
            <div key={name} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
              <p className="text-xs font-medium text-zinc-400 mb-2">{name.replace(/([a-z])([A-Z])/g, '$1 $2')}</p>
              <div className="flex items-end gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-zinc-500">Run #{runA}</p>
                  <p className="text-lg font-bold font-mono text-zinc-300">{valA != null ? `${valA}%` : '—'}</p>
                  {scoreA && (
                    <span className={`text-[10px] ${scoreA.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                      {scoreA.passed ? 'PASS' : 'FAIL'}
                    </span>
                  )}
                </div>
                <div className="text-center px-2">
                  <span className="text-zinc-500 text-lg">→</span>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-zinc-500">Run #{runB}</p>
                  <p className="text-lg font-bold font-mono text-zinc-300">{valB != null ? `${valB}%` : '—'}</p>
                  {scoreB && (
                    <span className={`text-[10px] ${scoreB.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                      {scoreB.passed ? 'PASS' : 'FAIL'}
                    </span>
                  )}
                </div>
                {delta != null && (
                  <div className="ml-auto text-right">
                    <span className={`text-sm font-bold font-mono ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {delta > 0 ? '+' : ''}{delta}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {a.root_cause !== b.root_cause && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-500">Root cause:</span>
          <span className="text-red-400">{a.root_cause.replace(/_/g, ' ')}</span>
          <span className="text-zinc-500">→</span>
          <span className="text-emerald-400">{b.root_cause.replace(/_/g, ' ')}</span>
        </div>
      )}
    </div>
  );
}

function RetrievedChunksTab({
  bug,
  expectedSet,
  onReParse,
  freya,
}: {
  bug: BugReport;
  expectedSet: Set<string>;
  onReParse?: () => void;
  freya: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'expected' | 'other'>('all');
  const [reParsing, setReParsing] = useState(false);

  useEffect(() => {
    if (!freya && filter !== 'all') setFilter('all');
  }, [freya, filter]);

  const chunks = bug.retrieved_chunks || [];

  const grouped = chunks.reduce<Record<string, RetrievedChunk>>((acc, chunk) => {
    acc[chunk.id] = chunk;
    return acc;
  }, {});

  const allInsIds = Object.keys(grouped);
  const expectedIds = allInsIds.filter((id) => expectedSet.has(id.toUpperCase()));
  const otherIds = allInsIds.filter((id) => !expectedSet.has(id.toUpperCase()));

  const displayIds =
    filter === 'expected' ? expectedIds : filter === 'other' ? otherIds : [...expectedIds, ...otherIds];

  const missingExpected = (bug.expected_ins_ids || []).filter(
    (eid) => !allInsIds.some((rid) => rid.toUpperCase() === eid.toUpperCase()),
  );

  const toggleExpand = (insId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(insId)) next.delete(insId);
      else next.add(insId);
      return next;
    });
  };

  if (chunks.length === 0) {
    if (bug.retrieved_chunks_raw) {
      const handleReParse = async () => {
        if (!onReParse) return;
        setReParsing(true);
        try {
          await api.updateBug(bug.id, { retrieved_chunks_raw: bug.retrieved_chunks_raw });
          onReParse();
        } finally {
          setReParsing(false);
        }
      };
      return (
        <div className="space-y-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-zinc-400">
              <p>Chunks could not be parsed into structured documents. Showing raw text below.</p>
              {onReParse && (
                <button
                  onClick={handleReParse}
                  disabled={reParsing}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                >
                  {reParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Re-parse Chunks
                </button>
              )}
            </div>
          </div>
          {freya && missingExpected.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-300">Expected INS IDs not found in retrieved chunks:</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {missingExpected.map((eid) => (
                    <span key={eid} className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-500/20 text-red-300 border border-red-500/30">{eid}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Raw Retrieved Text</h3>
            <pre className="text-xs text-zinc-400 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono leading-relaxed">{bug.retrieved_chunks_raw}</pre>
          </div>
        </div>
      );
    }
    return (
      <div className="text-center py-12 bg-zinc-900 border border-zinc-700 rounded-xl">
        <FileText className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
        <p className="text-zinc-400">No retrieved chunks available.</p>
        <p className="text-xs text-zinc-500 mt-1">Paste chunks when creating or editing the bug to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-zinc-300">Retrieved Chunks</strong> shows the actual document content your search engine returned.
          {freya && expectedSet.size > 0 && (
            <> Expected INS IDs are highlighted in <span className="text-emerald-400">green</span> so you can verify if the right documents were retrieved and whether they contain the expected answer.</>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(freya ? (['all', 'expected', 'other'] as const) : (['all'] as const)).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700'
            }`}
          >
            {f === 'all' ? `All (${allInsIds.length})` : f === 'expected' ? `Expected (${expectedIds.length})` : `Other (${otherIds.length})`}
          </button>
        ))}
        <span className="text-xs text-zinc-500 ml-auto">{displayIds.length} document(s)</span>
        {onReParse && bug.retrieved_chunks_raw && (
          <button
            onClick={async () => {
              setReParsing(true);
              try {
                await api.updateBug(bug.id, { retrieved_chunks_raw: bug.retrieved_chunks_raw });
                onReParse();
              } finally {
                setReParsing(false);
              }
            }}
            disabled={reParsing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] font-medium border border-zinc-700 disabled:opacity-50 transition-colors"
          >
            {reParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Re-parse
          </button>
        )}
      </div>

      {/* Missing expected IDs warning */}
      {freya && missingExpected.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-300">Expected INS IDs not found in retrieved chunks:</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {missingExpected.map((eid) => (
                <span key={eid} className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                  {eid}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-red-400/70 mt-1.5">This indicates a retrieval failure — the search engine did not return these documents.</p>
          </div>
        </div>
      )}

      {/* Chunk cards */}
      <div className="space-y-3">
        {displayIds.map((insId) => {
          const chunk = grouped[insId];
          if (!chunk) return null;
          const isExpected = freya && expectedSet.has(insId.toUpperCase());
          const expanded = expandedIds.has(insId);
          const allContent = chunk.metadata.chunks.flatMap((cc) => cc.content);

          return (
            <div
              key={insId}
              className={`rounded-xl border transition-colors ${
                isExpected
                  ? 'bg-emerald-500/5 border-emerald-500/25'
                  : 'bg-zinc-900 border-zinc-700'
              }`}
            >
              {/* Header */}
              <button
                onClick={() => toggleExpand(insId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono text-xs font-semibold ${isExpected ? 'text-emerald-300' : 'text-indigo-300'}`}>
                      {insId}
                    </span>
                    {isExpected && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        EXPECTED
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">{allContent.length} chunk(s)</span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">{chunk.metadata.title || 'Untitled document'}</p>
                </div>
              </button>

              {/* Expanded content */}
              {expanded && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Document metadata */}
                  {(chunk.metadata.attachment_name || chunk.metadata.countries.length > 0) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500 px-1">
                      {chunk.metadata.attachment_name && (
                        <span>File: <span className="text-zinc-400">{chunk.metadata.attachment_name}</span></span>
                      )}
                      {chunk.metadata.release_date && (
                        <span>Released: <span className="text-zinc-400">{chunk.metadata.release_date.split('T')[0]}</span></span>
                      )}
                      {chunk.metadata.countries.length > 0 && (
                        <span>Countries: <span className="text-zinc-400">{chunk.metadata.countries.slice(0, 5).join(', ')}{chunk.metadata.countries.length > 5 ? ` +${chunk.metadata.countries.length - 5}` : ''}</span></span>
                      )}
                    </div>
                  )}

                  {/* Chunk content */}
                  {chunk.metadata.chunks.map((cc, ci) => (
                    <div key={ci}>
                      {cc.document_name && (
                        <p className="text-[10px] text-zinc-500 font-mono mb-1">{cc.document_name}</p>
                      )}
                      {cc.content.map((text, ti) => (
                        <FormattedChunkContent key={ti} text={text} isExpected={isExpected} />
                      ))}
                    </div>
                  ))}

                  {allContent.length === 0 && (
                    <p className="text-xs text-zinc-500 italic px-1">No chunk content available for this document.</p>
                  )}

                  {/* Reference URLs */}
                  {chunk.metadata.ref_url.length > 0 && (
                    <div className="px-1">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Reference URLs</p>
                      {chunk.metadata.ref_url.map((url, ui) => (
                        <a
                          key={ui}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[10px] text-indigo-400 hover:text-indigo-300 truncate"
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BugDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { startEval, isRunning, jobs } = useEvalContext();
  const { freya } = useFreyaMode();

  const [bug, setBug] = useState<BugReport | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [evalHistory, setEvalHistory] = useState<EvaluationHistoryItem[]>([]);
  const [selectedRunNumber, setSelectedRunNumber] = useState<number | null>(null);
  const [rephrased, setRephrased] = useState<RephraseResponse | null>(null);
  const [tab, setTab] = useState<Tab>('evaluation');
  const [loading, setLoading] = useState(true);
  const [rephraseLoading, setRephraseLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showAllIns, setShowAllIns] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    user_question: '',
    expected_answer: '',
    actual_answer: '',
    ins_ids: '',
    expected_ins_ids: '',
    module_name: '',
    priority: 'medium' as Priority,
    retrieved_chunks_raw: '',
  });
  const [autoExtractedIds, setAutoExtractedIds] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [suiteDropdown, setSuiteDropdown] = useState(false);
  const [suiteList, setSuiteList] = useState<{ id: string; name: string }[]>([]);
  const [addingSuite, setAddingSuite] = useState(false);

  const evalRunning = id ? isRunning(id) : false;

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 5000);
  }, []);

  const extractInsIdsFromText = useCallback((text: string): string[] => {
    const matches = text.match(/INS\d{3,}/gi) || [];
    return [...new Set(matches.map((m) => m.toUpperCase()))];
  }, []);

  const startEdit = useCallback(() => {
    if (!bug) return;
    setEditForm({
      user_question: bug.user_question,
      expected_answer: bug.expected_answer || '',
      actual_answer: bug.actual_answer,
      ins_ids: (bug.ins_ids || []).join(', '),
      expected_ins_ids: (bug.expected_ins_ids || []).join(', '),
      module_name: bug.module_name || '',
      priority: bug.priority,
      retrieved_chunks_raw: bug.retrieved_chunks_raw || '',
    });
    setAutoExtractedIds([]);
    setDuplicateWarning('');
    setEditing(true);
  }, [bug]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleChunksRawChange = useCallback(
    (value: string) => {
      setEditForm((f) => ({ ...f, retrieved_chunks_raw: value }));
      const extracted = extractInsIdsFromText(value);
      setAutoExtractedIds(extracted);

      const currentManual = editForm.ins_ids
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const currentSet = new Set(currentManual);
      const newIds = extracted.filter((eid) => !currentSet.has(eid));
      if (newIds.length > 0) {
        const merged = [...currentManual, ...newIds];
        setEditForm((f) => ({ ...f, ins_ids: merged.join(', ') }));
        setDuplicateWarning('');
      }
      const dupes = extracted.filter((eid) => currentSet.has(eid));
      if (dupes.length > 0 && newIds.length === 0 && extracted.length > 0) {
        setDuplicateWarning(`Already present: ${dupes.join(', ')}`);
      } else {
        setDuplicateWarning('');
      }
    },
    [editForm.ins_ids, extractInsIdsFromText],
  );

  const handleInsIdsChange = useCallback((value: string) => {
    setEditForm((f) => ({ ...f, ins_ids: value }));
    const ids = value
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const unique = [...new Set(ids)];
    if (unique.length < ids.length) {
      setDuplicateWarning('Duplicate INS IDs removed on save');
    } else {
      setDuplicateWarning('');
    }
  }, []);

  const saveEdit = useCallback(async () => {
    if (!id) return;
    setEditSaving(true);
    try {
      const insIdsArr = [
        ...new Set(
          editForm.ins_ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      const payload: BugUpdate = {
        user_question: editForm.user_question,
        expected_answer: editForm.expected_answer,
        actual_answer: editForm.actual_answer,
        ins_ids: insIdsArr,
        expected_ins_ids: editForm.expected_ins_ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        module_name: editForm.module_name,
        priority: editForm.priority,
        retrieved_chunks_raw: editForm.retrieved_chunks_raw,
      };
      const updated = await api.updateBug(id, payload);
      setBug(updated);
      setEditing(false);
      setDuplicateWarning('');
      showToast({ type: 'success', message: 'Bug updated successfully' });
    } catch {
      showToast({ type: 'error', message: 'Failed to update bug' });
    } finally {
      setEditSaving(false);
    }
  }, [id, editForm, showToast]);

  const copyBugJson = useCallback(() => {
    if (!bug) return;
    const json = JSON.stringify({
      user_question: bug.user_question,
      expected_answer: bug.expected_answer,
      actual_answer: bug.actual_answer,
      ins_ids: bug.ins_ids,
      expected_ins_ids: bug.expected_ins_ids,
      module_name: bug.module_name,
      priority: bug.priority,
      retrieved_chunks_raw: bug.retrieved_chunks_raw,
    }, null, 2);
    navigator.clipboard.writeText(json);
    showToast({ type: 'success', message: 'Bug copied as JSON' });
  }, [bug, showToast]);

  const duplicateBug = useCallback(() => {
    if (!bug) return;
    navigate(`/bugs/new?from=${bug.id}`);
  }, [bug, navigate]);

  const openSuiteDropdown = useCallback(() => {
    setSuiteDropdown(true);
    api.listTestSuites().then((suites) => setSuiteList(suites.map((s) => ({ id: s.id, name: s.name })))).catch(() => {});
  }, []);

  const addToSuite = useCallback(async (suiteId: string) => {
    if (!bug) return;
    setAddingSuite(true);
    try {
      await api.addBugsToSuite(suiteId, [bug.id]);
      showToast({ type: 'success', message: 'Added to test suite' });
    } catch {
      showToast({ type: 'error', message: 'Failed to add to suite' });
    }
    setAddingSuite(false);
    setSuiteDropdown(false);
  }, [bug, showToast]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getBug(id)
      .then((b) => {
        setBug(b);
        if (b.has_evaluation) {
          return api.getEvaluation(id).then((ev) => {
            setEvaluation(ev);
            setSelectedRunNumber(ev.run_number);
          });
        }
      })
      .catch(() => setError('Bug not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const reloadBug = useCallback(() => {
    if (!id) return;
    api.getBug(id).then((b) => setBug(b));
  }, [id]);

  const currentJob = id ? jobs.find((j) => j.bugId === id) : null;
  useEffect(() => {
    if (!id || !currentJob) return;
    if (currentJob.status === 'completed') {
      api.getBug(id).then((b) => setBug(b));
      api.getEvaluation(id).then((ev) => {
        setEvaluation(ev);
        setSelectedRunNumber(ev.run_number);
      });
      loadHistory();
      showToast({ type: 'success', message: `Evaluation completed in ${currentJob.elapsed}s` });
    } else if (currentJob.status === 'failed') {
      showToast({ type: 'error', message: currentJob.error || 'Evaluation failed' });
    }
  }, [currentJob?.status]);

  async function loadHistory() {
    if (!id) return;
    try {
      const history = await api.getEvaluationHistory(id);
      setEvalHistory(history);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (evaluation && id) {
      loadHistory();
    }
  }, [evaluation, id]);

  function runEvaluation() {
    if (!id || !bug) return;
    setError('');
    startEval(id, bug.user_question);
  }

  async function loadRephrase() {
    if (!id) return;
    setRephraseLoading(true);
    try {
      const result = await api.getRephrased(id);
      setRephrased(result);
    } catch {
      try {
        const result = await api.generateRephrased(id);
        setRephrased(result);
      } catch {
        // silent
      }
    } finally {
      setRephraseLoading(false);
    }
  }

  async function regenerateRephrase() {
    if (!id) return;
    setRephraseLoading(true);
    try {
      const result = await api.generateRephrased(id);
      setRephrased(result);
      showToast({ type: 'success', message: 'Rephrased questions regenerated' });
    } catch {
      showToast({ type: 'error', message: 'Failed to regenerate' });
    } finally {
      setRephraseLoading(false);
    }
  }

  function copyQuestion(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }

  async function updateStatus(status: string) {
    if (!id) return;
    setStatusUpdating(true);
    try {
      const b = await api.updateBugStatus(id, status);
      setBug(b);
    } catch {
      // silent
    } finally {
      setStatusUpdating(false);
    }
  }

  async function deleteBug() {
    if (!id) return;
    if (!confirm('Delete this bug?')) return;
    await api.deleteBug(id);
    navigate('/bugs');
  }

  function selectHistoryRun(runNumber: number) {
    setSelectedRunNumber(runNumber);
    const run = evalHistory.find((h) => h.run_number === runNumber);
    if (run) {
      setEvaluation(run);
    }
  }

  useEffect(() => {
    if (tab === 'rephrase' && !rephrased && id) loadRephrase();
  }, [tab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!bug) {
    return <p className="text-zinc-500">Bug not found.</p>;
  }

  const expectedSet = new Set((bug.expected_ins_ids || []).map((id) => id.toUpperCase()));
  const displayedEvaluation = evaluation;

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border text-sm font-medium animate-slide-in ${
            toast.type === 'success'
              ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-900/90 border-red-700 text-red-200'
              : 'bg-zinc-800/90 border-zinc-600 text-zinc-200'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
          {toast.type === 'error' && <XCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Evaluation progress banner */}
      {evalRunning && currentJob && (
        <div className="bg-indigo-900/40 border border-indigo-700/50 rounded-xl px-5 py-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          <span className="text-sm text-indigo-200">
            Evaluation in progress...{' '}
            <span className="font-mono">
              {Math.floor(currentJob.elapsed / 60)}:{(currentJob.elapsed % 60).toString().padStart(2, '0')}
            </span>
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/bugs')} className="mt-1 text-zinc-500 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={editForm.user_question}
              onChange={(e) => setEditForm((f) => ({ ...f, user_question: e.target.value }))}
              className="w-full text-xl font-bold bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500 focus:outline-none mb-2"
            />
          ) : (
            <h1 className="text-xl font-bold leading-tight mb-2">{bug.user_question}</h1>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`px-2 py-0.5 rounded-full font-medium ${
                bug.status === 'open'
                  ? 'bg-amber-500/20 text-amber-300'
                  : bug.status === 'resolved'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-zinc-500/20 text-zinc-400'
              }`}
            >
              {bug.status}
            </span>
            {editing ? (
              <select
                value={editForm.priority}
                onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            ) : (
              <span className={`px-2 py-0.5 rounded-full font-medium ${priorityColor(bug.priority)}`}>
                {bug.priority}
              </span>
            )}
            <span className="text-zinc-500">{formatDate(bug.created_at)}</span>
            {bug.evaluation_count > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                {bug.evaluation_count} eval run{bug.evaluation_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {freya && (
            <>
              {/* Module name (edit mode) */}
              {editing && (
                <div className="mt-2">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Module</label>
                  <input
                    value={editForm.module_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, module_name: e.target.value }))}
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none"
                    placeholder="e.g. regulations"
                  />
                </div>
              )}
              {!editing && bug.module_name && (
                <div className="mt-2 text-xs text-zinc-500">
                  Module: <span className="text-zinc-300">{bug.module_name}</span>
                </div>
              )}

              {/* INS ID section */}
              {editing ? (
                <div className="mt-3 bg-zinc-900 border border-zinc-700 rounded-lg p-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Retrieved INS IDs (comma-separated)</label>
                      {autoExtractedIds.length > 0 && (
                        <span className="text-[10px] text-indigo-400">auto-merged from chunks</span>
                      )}
                    </div>
                    <input
                      value={editForm.ins_ids}
                      onChange={(e) => handleInsIdsChange(e.target.value)}
                      className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none"
                      placeholder="INS12345, INS67890 — auto-extracted from chunks + manual"
                    />
                    {duplicateWarning && (
                      <p className="text-[10px] text-amber-400 mt-1">{duplicateWarning}</p>
                    )}
                    <p className="text-[10px] text-zinc-500 mt-1">Edit manually or paste chunks below to auto-extract. Duplicates are kept unique.</p>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Expected INS IDs (comma-separated)</label>
                    <input
                      value={editForm.expected_ins_ids}
                      onChange={(e) => setEditForm((f) => ({ ...f, expected_ins_ids: e.target.value }))}
                      className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none"
                      placeholder="INS12345, INS67890"
                    />
                  </div>
                </div>
              ) : (
                (bug.ins_ids.length > 0 || expectedSet.size > 0) && (
                  <div className="mt-3 bg-zinc-900 border border-zinc-700 rounded-lg p-3 space-y-2">
                    {expectedSet.size > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold w-16 flex-shrink-0">Expected</span>
                        {bug.expected_ins_ids.map((eid) => {
                          const found = bug.ins_ids.some((rid) => rid.toUpperCase() === eid.toUpperCase());
                          return (
                            <span
                              key={`exp-${eid}`}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                found
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
                              }`}
                            >
                              {found ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                              {eid}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {bug.ins_ids.length > 0 && (
                      <div className="flex flex-wrap items-start gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold w-16 flex-shrink-0 mt-0.5">Retrieved</span>
                        <div className="flex flex-wrap gap-1">
                          {(showAllIns ? bug.ins_ids : bug.ins_ids.slice(0, 10)).map((rid) => {
                            const isExpected = expectedSet.has(rid.toUpperCase());
                            return (
                              <span
                                key={rid}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  isExpected
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-semibold'
                                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                                }`}
                              >
                                {rid}
                              </span>
                            );
                          })}
                          {!showAllIns && bug.ins_ids.length > 10 && (
                            <button
                              onClick={() => setShowAllIns(true)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/25 transition-colors"
                            >
                              +{bug.ins_ids.length - 10} more
                            </button>
                          )}
                          {showAllIns && bug.ins_ids.length > 10 && (
                            <button
                              onClick={() => setShowAllIns(false)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              show less
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
              >
                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                onClick={cancelEdit}
                disabled={editSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={copyBugJson}
                title="Copy as JSON"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
              >
                <Clipboard className="w-4 h-4" />
              </button>
              <button
                onClick={duplicateBug}
                title="Duplicate as new bug"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                <CopyPlus className="w-4 h-4" />
              </button>
              <div className="relative">
                <button
                  onClick={openSuiteDropdown}
                  title="Add to test suite"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                >
                  <FlaskConical className="w-4 h-4" />
                </button>
                {suiteDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                    {suiteList.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-zinc-500">No suites. Create one in Test Suites page.</p>
                    ) : (
                      suiteList.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => addToSuite(s.id)}
                          disabled={addingSuite}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                        >
                          {s.name}
                        </button>
                      ))
                    )}
                    <button
                      onClick={() => setSuiteDropdown(false)}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-zinc-500 hover:bg-zinc-700 border-t border-zinc-700 mt-1"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <select
                disabled={statusUpdating}
                value={bug.status}
                onChange={(e) => updateStatus(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="invalid">Invalid</option>
              </select>
              <button onClick={deleteBug} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expected vs Actual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Expected Answer</h3>
          {editing ? (
            <textarea
              value={editForm.expected_answer}
              onChange={(e) => setEditForm((f) => ({ ...f, expected_answer: e.target.value }))}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none resize-y max-h-28 overflow-y-auto scrollbar-thin"
            />
          ) : (
            <div className="text-sm text-zinc-300 whitespace-pre-wrap max-h-32 overflow-y-auto pr-1 scrollbar-thin">{bug.expected_answer || '(not provided)'}</div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Actual Answer</h3>
          {editing ? (
            <textarea
              value={editForm.actual_answer}
              onChange={(e) => setEditForm((f) => ({ ...f, actual_answer: e.target.value }))}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none resize-y max-h-28 overflow-y-auto scrollbar-thin"
            />
          ) : (
            <div className="text-sm text-zinc-300 whitespace-pre-wrap max-h-32 overflow-y-auto pr-1 scrollbar-thin">{bug.actual_answer}</div>
          )}
        </div>
      </div>

      {/* Retrieved Chunks Raw (edit mode only) */}
      {editing && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Retrieved Chunks (raw text / JSON)</h3>
            {autoExtractedIds.length > 0 && (
              <span className="text-[10px] text-indigo-400">{autoExtractedIds.length} INS ID(s) extracted</span>
            )}
          </div>
            <textarea
              value={editForm.retrieved_chunks_raw}
              onChange={(e) => handleChunksRawChange(e.target.value)}
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none resize-y max-h-36 overflow-y-auto scrollbar-thin"
            placeholder="Paste retrieved chunks JSON or raw text here — INS IDs auto-extracted and merged into Retrieved INS IDs above"
          />
          <p className="text-[10px] text-zinc-500 mt-1">INS IDs are auto-extracted and merged into the Retrieved INS IDs field above. Duplicates are kept unique.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-700">
        {[
          { key: 'evaluation' as Tab, label: 'Evaluation', icon: Play },
          { key: 'chunks' as Tab, label: 'Retrieved Chunks', icon: FileText },
          { key: 'rephrase' as Tab, label: 'Rephrased Questions', icon: MessageSquare },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Evaluation */}
      {tab === 'evaluation' && (
        <div className="space-y-6">
          {/* Explanation */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-300 leading-relaxed">
              <strong className="text-zinc-200">Evaluation</strong> runs 6 industry-standard DeepEval metrics to measure your RAG system's quality using an LLM-as-a-judge approach.
              Metrics include <strong>Faithfulness</strong> (factual accuracy), <strong>Answer Relevancy</strong> (on-topic response), <strong>Contextual Relevancy</strong> (right docs retrieved), 
              <strong>Contextual Precision</strong> (ranking quality), <strong>Contextual Recall</strong> (completeness), and <strong>Hallucination</strong> (fabricated facts).
              {!bug.retrieved_chunks_raw && !bug.retrieved_chunks?.length && (
                <> <strong className="text-amber-400">Note:</strong> Most metrics require retrieved chunks. Provide chunks when creating or editing the bug to unlock full evaluation.</>
              )}
            </div>
          </div>

          {!displayedEvaluation ? (
            <div className="text-center py-12 bg-zinc-900 border border-zinc-700 rounded-xl">
              <Play className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
              <p className="text-zinc-400 mb-4">No evaluation run yet.</p>
              <button
                onClick={runEvaluation}
                disabled={evalRunning}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
              >
                {evalRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {evalRunning ? 'Evaluating...' : 'Run Evaluation'}
              </button>
            </div>
          ) : (
            <>
              {/* Controls row */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={runEvaluation}
                  disabled={evalRunning}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium"
                >
                  {evalRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {evalRunning ? 'Running...' : 'Re-run'}
                </button>

                {evalHistory.length > 1 && (
                  <div className="relative inline-flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-zinc-500" />
                    <select
                      value={selectedRunNumber ?? ''}
                      onChange={(e) => selectHistoryRun(Number(e.target.value))}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      {evalHistory.map((h) => (
                        <option key={h.run_number} value={h.run_number}>
                          Run #{h.run_number}{h.run_number === evalHistory[0]?.run_number ? ' (latest)' : ''} — {formatDate(h.evaluated_at)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-1.5 pointer-events-none" />
                  </div>
                )}

                <span className="text-xs text-zinc-500">
                  {displayedEvaluation.run_number && `Run #${displayedEvaluation.run_number} · `}
                  Evaluated {formatDate(displayedEvaluation.evaluated_at)}
                </span>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                {displayedEvaluation.scores.map((s) => (
                  <ScoreBar key={s.name} metric={s} />
                ))}
              </div>

              {/* Root cause */}
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-zinc-300">Root Cause</h3>
                  <RootCauseBadge rootCause={displayedEvaluation.root_cause} />
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{displayedEvaluation.root_cause_explanation}</p>
              </div>

              {/* Fix suggestions */}
              {displayedEvaluation.fix_suggestions.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-zinc-300">Fix Suggestions</h3>
                  </div>
                  <ol className="space-y-2">
                    {displayedEvaluation.fix_suggestions.map((fix, i) => (
                      <li key={i} className="flex gap-3 text-sm text-zinc-400">
                        <span className="text-indigo-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                        {fix}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Eval Diff */}
              {evalHistory.length >= 2 && (
                <EvalDiffView history={evalHistory} />
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Retrieved Chunks */}
      {tab === 'chunks' && (
        <RetrievedChunksTab bug={bug} expectedSet={expectedSet} onReParse={reloadBug} freya={freya} />
      )}

      {/* Tab: Rephrased Questions */}
      {tab === 'rephrase' && (
        <div>
          {/* Explanation */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-300">Rephrased Questions</strong> generates alternative ways to ask the same question.
              If the original question has poor retrieval results, try these rephrasings — they may help the search engine find better documents.
              Copy any question and test it against your chatbot.
            </div>
          </div>

          {rephraseLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full" />
            </div>
          ) : rephrased ? (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Original Question</h3>
                <p className="text-sm text-zinc-300">{rephrased.original}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Suggested Rephrasings
                </h3>
                <div className="space-y-2">
                  {rephrased.rephrased.map((q, i) => (
                    <div
                      key={i}
                      className="group flex items-start gap-3 bg-zinc-800 rounded-lg p-3 border border-zinc-700 hover:border-zinc-600 transition-colors"
                    >
                      <span className="text-indigo-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                      <p className="text-sm text-zinc-300 flex-1">{q}</p>
                      <button
                        onClick={() => copyQuestion(q, i)}
                        className="flex-shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60 opacity-0 group-hover:opacity-100 transition-all"
                        title="Copy to clipboard"
                      >
                        {copiedIdx === i ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={regenerateRephrase}
                disabled={rephraseLoading}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${rephraseLoading ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            </div>
          ) : (
            <div className="text-center py-12 bg-zinc-900 border border-zinc-700 rounded-xl">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
              <p className="text-zinc-400">Click the tab to generate rephrased questions.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
