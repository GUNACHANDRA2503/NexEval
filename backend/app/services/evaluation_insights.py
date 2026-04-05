"""LLM-generated root-cause explanation and fix suggestions (with static fallback)."""

from __future__ import annotations

import json
import logging
import os

from openai import OpenAI

from app.schemas import BugReport, MetricScore
from app.services.openai_chat_compat import chat_completions_create

logger = logging.getLogger(__name__)

_ROOT_CAUSE_HINTS: dict[str, str] = {
    "RETRIEVAL_FAILURE": "Retrieval failed: chunks are missing or not relevant enough to answer the question.",
    "RANKING_ISSUE": "Relevant content exists in retrieved material but ranking ordered less useful chunks first.",
    "GENERATION_FAILURE": "Retrieval was adequate but the answer did not stay faithful to the context.",
    "HALLUCINATION": "The answer includes claims not well supported by the retrieved context.",
    "IRRELEVANT_ANSWER": "The answer does not address the user's question well.",
    "ACCEPTABLE": "Metrics are within acceptable ranges overall.",
}


def _truncate(text: str, max_chars: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 3].rstrip() + "..."


def _context_excerpt(bug: BugReport, max_chars: int = 4500) -> str:
    parts: list[str] = []
    if bug.retrieved_chunks_raw:
        parts.append(_truncate(bug.retrieved_chunks_raw, max_chars))
    else:
        for ch in bug.retrieved_chunks[:12]:
            title = ch.metadata.title or ch.module_name or ch.id
            for cc in ch.metadata.chunks[:3]:
                for line in cc.content[:5]:
                    parts.append(line)
            if title:
                parts.insert(0, f"[{title}]")
    blob = "\n\n".join(parts)
    return _truncate(blob, max_chars)


def try_llm_evaluation_insights(
    bug: BugReport,
    root_cause: str,
    scores: list[MetricScore],
    model: str,
) -> tuple[str, list[str]] | None:
    """
    Ask the LLM for a tailored explanation and fix list. Returns None on any failure
    (caller should use static explain_root_cause / suggest_fixes).
    """
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return None

    metrics_lines: list[str] = []
    for s in scores:
        r = (s.reason or "").replace("\n", " ").strip()
        if len(r) > 280:
            r = r[:277] + "..."
        metrics_lines.append(f"- {s.name}: score={s.score:.4f}, passed={s.passed}, threshold={s.threshold:.4f}")
        if r:
            metrics_lines.append(f"  brief_reason: {r}")

    hint = _ROOT_CAUSE_HINTS.get(root_cause, root_cause)

    user_payload = f"""Classified root-cause label: {root_cause}
Summary of that label: {hint}

User question:
{_truncate(bug.user_question, 2000)}

Expected answer (if any):
{_truncate(bug.expected_answer, 2000)}

Actual answer:
{_truncate(bug.actual_answer, 2000)}

Retrieval context excerpt (may be truncated):
{_context_excerpt(bug)}

DeepEval-style metrics:
{chr(10).join(metrics_lines)}

Respond with JSON only, no markdown:
{{"explanation": "<2-5 sentences explaining what likely went wrong for THIS bug, referencing the question/answers/context and the metrics.>", "fixes": ["<3-6 short, specific actionable items for the engineering team>"]}}
"""

    try:
        client = OpenAI(api_key=api_key)
        resp = chat_completions_create(
            client,
            max_output_tokens=900,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You help engineers debug RAG chatbots. Be concrete and tie advice to the bug content. "
                        "Output valid JSON only with keys explanation (string) and fixes (array of strings)."
                    ),
                },
                {"role": "user", "content": user_payload},
            ],
            response_format={"type": "json_object"},
            temperature=0.25,
        )
        raw = (resp.choices[0].message.content or "").strip()
        data = json.loads(raw)
        explanation = (data.get("explanation") or "").strip()
        fixes_raw = data.get("fixes")
        if not explanation or not isinstance(fixes_raw, list):
            return None
        fixes: list[str] = []
        for x in fixes_raw:
            if isinstance(x, str) and (t := x.strip()):
                fixes.append(t)
        if not fixes:
            return None
        fixes = fixes[:8]
        return explanation, fixes
    except Exception as e:
        logger.warning("LLM evaluation insights failed: %s", e)
        return None
