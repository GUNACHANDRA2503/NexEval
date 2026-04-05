import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Info, X, AlertTriangle, CheckCircle2, XCircle, Lightbulb } from 'lucide-react';
import type { MetricScore } from '../types';
import { scoreBg, scoreColor } from '../lib/utils';

const METRIC_LABELS: Record<string, string> = {
  Faithfulness: 'Faithfulness',
  AnswerRelevancy: 'Answer Relevancy',
  ContextualRelevancy: 'Contextual Relevancy',
  ContextualPrecision: 'Contextual Precision',
  ContextualRecall: 'Contextual Recall',
  Hallucination: 'Hallucination',
};

interface MetricHelp {
  simple: string;
  checks: string;
  goodMeans: string;
  badMeans: string;
  tip: string;
}

const METRIC_HELP: Record<string, MetricHelp> = {
  Faithfulness: {
    simple: 'Did the chatbot stick to the facts from the documents it retrieved?',
    checks: 'Compares every claim in the chatbot\'s answer against the retrieved chunks. If a claim exists in the chunks, it\'s faithful.',
    goodMeans: 'The answer only says things that are actually in the retrieved documents. No made-up facts.',
    badMeans: 'The answer includes information that can\'t be found in the retrieved documents — the chatbot may be making things up.',
    tip: 'A high faithfulness score doesn\'t mean the answer is correct — it just means the chatbot didn\'t fabricate beyond what the docs say.',
  },
  AnswerRelevancy: {
    simple: 'Did the chatbot actually answer the question that was asked?',
    checks: 'Checks if the answer addresses the user\'s question directly, rather than talking about something else.',
    goodMeans: 'The answer is on-topic and directly addresses what the user wanted to know.',
    badMeans: 'The answer drifts off-topic, gives irrelevant information, or only partially addresses the question.',
    tip: 'If this score is low but Faithfulness is high, the chatbot found the right documents but gave the wrong answer from them.',
  },
  ContextualRelevancy: {
    simple: 'Did the search engine find the right documents for this question?',
    checks: 'Looks at the retrieved chunks and asks: "Do these documents contain information related to the question?"',
    goodMeans: 'The search pipeline retrieved documents that are relevant to the question.',
    badMeans: 'The retrieved documents are about different topics — the search/retrieval pipeline is not finding the right content.',
    tip: 'This is a retrieval pipeline problem. If this is 0%, the search engine fetched completely wrong documents. Check your vector embeddings and search configuration.',
  },
  ContextualPrecision: {
    simple: 'Are the most relevant documents ranked at the top of the results?',
    checks: 'Needs an "Expected Answer" to work. Compares each retrieved chunk against the expected answer to check ranking order.',
    goodMeans: 'The most useful documents appear first in the retrieved results — good ranking.',
    badMeans: 'Relevant documents are buried below irrelevant ones — the ranking/reranking needs improvement.',
    tip: 'Requires "Expected Answer" to evaluate. If the expected INS ID\'s document is not in the top chunks, this will be low.',
  },
  ContextualRecall: {
    simple: 'Did the search find ALL the information needed to produce the expected answer?',
    checks: 'Needs an "Expected Answer" to work. Checks if every piece of information in the expected answer can be found in the retrieved chunks.',
    goodMeans: 'All the information needed for the expected answer was found in the retrieved chunks.',
    badMeans: 'Some information from the expected answer is missing from the retrieved chunks — the search didn\'t find everything.',
    tip: 'Requires "Expected Answer" to evaluate. A 0% score means none of the expected answer\'s content was found in the retrieved chunks.',
  },
  Hallucination: {
    simple: 'Did the chatbot make up facts that contradict or aren\'t in the documents?',
    checks: 'Looks for statements in the answer that contradict the retrieved context or introduce completely new claims.',
    goodMeans: 'Warning: For this metric, a HIGH score means MORE hallucination was detected — this is bad!',
    badMeans: 'A LOW score means less hallucination — the chatbot stayed close to the source material.',
    tip: 'This metric is inverted — 100% means maximum hallucination. If Faithfulness is also 100%, it likely means the context itself is being hallucinated about.',
  },
};

function SimpleSummary({ metric }: { metric: MetricScore }) {
  const pct = Math.round(metric.score * 100);
  const name = METRIC_LABELS[metric.name] || metric.name;
  const isHallucination = metric.name === 'Hallucination';

  if (metric.passed) {
    if (isHallucination) {
      return (
        <p className="text-xs text-amber-300">
          <strong>Hallucination detected ({pct}%).</strong> The chatbot's answer contains content that contradicts or goes beyond the retrieved documents. This needs investigation.
        </p>
      );
    }
    return (
      <p className="text-xs text-emerald-300">
        <strong>{name} looks good ({pct}%).</strong> This metric passed the {Math.round(metric.threshold * 100)}% threshold. No action needed for this area.
      </p>
    );
  }

  switch (metric.name) {
    case 'Faithfulness':
      return (
        <p className="text-xs text-red-300">
          <strong>Low faithfulness ({pct}%).</strong> The chatbot's answer contains claims not found in the retrieved documents. It may be fabricating information.
        </p>
      );
    case 'AnswerRelevancy':
      return (
        <p className="text-xs text-red-300">
          <strong>Answer is off-topic ({pct}%).</strong> The chatbot's response doesn't directly answer the user's question. It may be talking about related but wrong topics.
        </p>
      );
    case 'ContextualRelevancy':
      return (
        <p className="text-xs text-red-300">
          <strong>Wrong documents retrieved ({pct}%).</strong> The search engine fetched chunks that are not relevant to this question. This is a retrieval/search pipeline issue.
        </p>
      );
    case 'ContextualPrecision':
      return (
        <p className="text-xs text-red-300">
          <strong>Bad ranking ({pct}%).</strong> The relevant documents are not ranked at the top. The re-ranking or search scoring needs tuning.
        </p>
      );
    case 'ContextualRecall':
      return (
        <p className="text-xs text-red-300">
          <strong>Missing information ({pct}%).</strong> The retrieved chunks don't contain all the information needed to produce the expected answer. Key documents are missing from search results.
        </p>
      );
    case 'Hallucination':
      return (
        <p className="text-xs text-red-300">
          <strong>No major hallucination (score: {pct}%).</strong> The score is below threshold, meaning the chatbot mostly stuck to the retrieved content.
        </p>
      );
    default:
      return (
        <p className="text-xs text-red-300">
          <strong>{name} failed ({pct}%).</strong> Score is below the {Math.round(metric.threshold * 100)}% threshold.
        </p>
      );
  }
}

function InfoPopup({ metric, info, onClose, anchorRect }: {
  metric: MetricScore;
  info: MetricHelp;
  onClose: () => void;
  anchorRect: DOMRect | null;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRect) return;
    const popupW = 340;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 8;

    if (left + popupW > window.innerWidth - 16) {
      left = window.innerWidth - popupW - 16;
    }
    if (left < 16) left = 16;

    if (top + 300 > window.innerHeight) {
      top = anchorRect.top - 308;
      if (top < 16) top = 16;
    }

    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const label = METRIC_LABELS[metric.name] || metric.name;
  const pct = Math.round(metric.score * 100);
  const isHallucination = metric.name === 'Hallucination';

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[9999] w-[340px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-slide-in"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-zinc-100">{label}</h4>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded hover:bg-zinc-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-zinc-800 rounded-lg p-3 mb-3">
          <p className="text-xs text-zinc-200 leading-relaxed font-medium">{info.simple}</p>
        </div>

        <div className="space-y-2.5 text-[11px]">
          <div>
            <p className="text-zinc-500 uppercase tracking-wider font-semibold mb-0.5">How it works</p>
            <p className="text-zinc-400 leading-relaxed">{info.checks}</p>
          </div>

          <div className="flex gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-zinc-300 leading-relaxed">{isHallucination ? info.badMeans : info.goodMeans}</p>
          </div>

          <div className="flex gap-2">
            <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-zinc-300 leading-relaxed">{isHallucination ? info.goodMeans : info.badMeans}</p>
          </div>

          <div className="flex gap-2 bg-indigo-500/10 rounded-lg px-2.5 py-2 border border-indigo-500/20">
            <Lightbulb className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-indigo-400 leading-relaxed">{info.tip}</p>
          </div>
        </div>

        <div className="mt-3 pt-2 border-t border-zinc-700 flex items-center justify-between text-[10px] text-zinc-500">
          <span>Current: <span className={`font-mono font-bold ${scoreColor(metric.score)}`}>{pct}%</span></span>
          <span>Threshold: <span className="font-mono">{Math.round(metric.threshold * 100)}%</span></span>
          <span className={metric.passed ? 'text-emerald-400' : 'text-red-400'}>{metric.passed ? 'PASSED' : 'FAILED'}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ScoreBar({ metric }: { metric: MetricScore }) {
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const infoBtnRef = useRef<HTMLSpanElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const pct = Math.round(metric.score * 100);
  const label = METRIC_LABELS[metric.name] || metric.name;
  const info = METRIC_HELP[metric.name];

  const openInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (infoBtnRef.current) {
      setAnchorRect(infoBtnRef.current.getBoundingClientRect());
    }
    setShowInfo((prev) => !prev);
  }, []);

  const closeInfo = useCallback(() => setShowInfo(false), []);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/60 transition-colors rounded-lg"
      >
        <div className="flex-1 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200">{label}</span>
              {info && (
                <span
                  ref={infoBtnRef}
                  onClick={openInfo}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-700 hover:bg-indigo-500/40 text-zinc-400 hover:text-indigo-300 cursor-pointer transition-colors"
                >
                  <Info className="w-2.5 h-2.5" />
                </span>
              )}
            </div>
            <span className={`text-sm font-mono font-bold ${scoreColor(metric.score)}`}>
              {pct}%
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${scoreBg(metric.score)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${metric.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
          {metric.passed ? 'PASS' : 'FAIL'}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-700">
          {/* Simple verdict */}
          <div className={`mt-3 rounded-lg px-3 py-2.5 ${metric.passed ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            <div className="flex items-start gap-2">
              {metric.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <SimpleSummary metric={metric} />
            </div>
          </div>

          {/* Detailed reason from DeepEval */}
          {metric.reason && (
            <div className="mt-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Detailed Analysis</p>
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                {metric.reason}
              </p>
            </div>
          )}

          {/* Score summary bar */}
          <div className="flex items-center gap-4 text-[10px] text-zinc-500 mt-3 pt-2 border-t border-zinc-700">
            <span>Score: <span className={`font-mono font-bold ${scoreColor(metric.score)}`}>{pct}%</span></span>
            <span>Threshold: <span className="font-mono">{Math.round(metric.threshold * 100)}%</span></span>
            <span>Verdict: <span className={metric.passed ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{metric.passed ? 'Pass' : 'Fail'}</span></span>
          </div>
        </div>
      )}

      {showInfo && info && (
        <InfoPopup metric={metric} info={info} onClose={closeInfo} anchorRect={anchorRect} />
      )}
    </div>
  );
}
