from __future__ import annotations

from datetime import datetime, timezone

from deepeval.metrics import (
    AnswerRelevancyMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
    ContextualRelevancyMetric,
    FaithfulnessMetric,
    HallucinationMetric,
)
from deepeval.test_case import LLMTestCase

from app.config import settings
from app.services.openai_user import DEFAULT_EVAL_MODEL
from app.schemas import (
    BugReport,
    EvaluationResult,
    MetricScore,
    RetrievedChunk,
)
from app.services.root_cause import classify_root_cause, explain_root_cause
from app.services.fix_suggester import suggest_fixes
from app.services.evaluation_insights import try_llm_evaluation_insights


def _flatten_retrieval_context(chunks: list[RetrievedChunk]) -> list[str]:
    """Flatten all chunk content strings into a single list for DeepEval."""
    context_pieces: list[str] = []
    for chunk in chunks:
        for chunk_content in chunk.metadata.chunks:
            context_pieces.extend(chunk_content.content)
    return context_pieces


def _raw_text_to_context(raw: str) -> list[str]:
    """Split raw text into context pieces when structured chunks aren't available.
    Splits on double-newlines or treats the whole thing as one piece."""
    if not raw or not raw.strip():
        return []
    paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]
    if not paragraphs:
        return [raw.strip()]
    min_len = settings.min_paragraph_length
    return [p for p in paragraphs if len(p) > min_len] or [raw.strip()]


def _build_test_case(
    bug: BugReport, retrieval_context: list[str]
) -> LLMTestCase:
    return LLMTestCase(
        input=bug.user_question,
        actual_output=bug.actual_answer,
        expected_output=bug.expected_answer if bug.expected_answer else None,
        retrieval_context=retrieval_context,
        context=retrieval_context,
    )


def _run_metric(metric, test_case: LLMTestCase) -> MetricScore:
    try:
        metric.measure(test_case)
        return MetricScore(
            name=metric.__class__.__name__.replace("Metric", ""),
            score=round(metric.score, 4),
            threshold=metric.threshold,
            passed=metric.is_successful(),
            reason=getattr(metric, "reason", "") or "",
        )
    except Exception as e:
        return MetricScore(
            name=metric.__class__.__name__.replace("Metric", ""),
            score=0.0,
            threshold=getattr(metric, "threshold", 0.5),
            passed=False,
            reason=f"Metric error: {str(e)}",
        )


def run_evaluation(bug: BugReport, model: str | None = None) -> EvaluationResult:
    """Run all 6 DeepEval metrics and return a complete evaluation result."""
    m = (model or "").strip() or DEFAULT_EVAL_MODEL
    retrieval_context = _flatten_retrieval_context(bug.retrieved_chunks)

    # Fallback: if structured chunks yielded nothing, use raw text
    if not retrieval_context and bug.retrieved_chunks_raw:
        retrieval_context = _raw_text_to_context(bug.retrieved_chunks_raw)

    # If no retrieval context, only run Answer Relevancy (doesn't need chunks)
    if not retrieval_context:
        test_case_no_context = LLMTestCase(
            input=bug.user_question,
            actual_output=bug.actual_answer,
            expected_output=bug.expected_answer if bug.expected_answer else None,
            retrieval_context=[],
            context=[],
        )
        
        answer_relevancy = AnswerRelevancyMetric(
            threshold=settings.answer_relevancy_threshold,
            model=m,
            include_reason=True,
        )
        
        scores = [_run_metric(answer_relevancy, test_case_no_context)]
        
        # Add placeholder scores for metrics that require chunks
        chunks_required_msg = "Retrieved chunks are required to evaluate this metric. Please provide chunks in the 'Retrieved Chunks / Context' field when creating or editing the bug."
        
        scores.extend([
            MetricScore(
                name="Faithfulness",
                score=0.0,
                threshold=settings.faithfulness_threshold,
                passed=False,
                reason=chunks_required_msg,
            ),
            MetricScore(
                name="ContextualRelevancy",
                score=0.0,
                threshold=settings.contextual_relevancy_threshold,
                passed=False,
                reason=chunks_required_msg,
            ),
            MetricScore(
                name="Hallucination",
                score=0.0,
                threshold=settings.hallucination_threshold,
                passed=False,
                reason=chunks_required_msg,
            ),
        ])
        
        has_expected = bool(bug.expected_answer)
        if has_expected:
            scores.extend([
                MetricScore(
                    name="ContextualPrecision",
                    score=0.0,
                    threshold=settings.contextual_precision_threshold,
                    passed=False,
                    reason=chunks_required_msg,
                ),
                MetricScore(
                    name="ContextualRecall",
                    score=0.0,
                    threshold=settings.contextual_recall_threshold,
                    passed=False,
                    reason=chunks_required_msg,
                ),
            ])
        
        static_explanation = (
            "No retrieval context provided. Only Answer Relevancy was evaluated. "
            "The other metrics require retrieved chunks to measure faithfulness, relevancy, precision, recall, and hallucination."
        )
        static_fixes = [
            "Provide retrieved chunks or context when creating or editing the bug.",
            "Paste the JSON output from your RAG retrieval step into the Retrieved Chunks field.",
            "Re-run evaluation after adding context to get all metrics.",
        ]
        llm_insight = try_llm_evaluation_insights(bug, "RETRIEVAL_FAILURE", scores, m)
        if llm_insight:
            explanation, fix_suggestions = llm_insight
        else:
            explanation, fix_suggestions = static_explanation, static_fixes

        return EvaluationResult(
            bug_id=bug.id,
            scores=scores,
            root_cause="RETRIEVAL_FAILURE",
            root_cause_explanation=explanation,
            fix_suggestions=fix_suggestions,
            evaluated_at=datetime.now(timezone.utc).isoformat(),
        )

    test_case = _build_test_case(bug, retrieval_context)

    metrics = [
        FaithfulnessMetric(
            threshold=settings.faithfulness_threshold,
            model=m,
            include_reason=True,
        ),
        AnswerRelevancyMetric(
            threshold=settings.answer_relevancy_threshold,
            model=m,
            include_reason=True,
        ),
        ContextualRelevancyMetric(
            threshold=settings.contextual_relevancy_threshold,
            model=m,
            include_reason=True,
        ),
        HallucinationMetric(
            threshold=settings.hallucination_threshold,
            model=m,
            include_reason=True,
        ),
    ]

    has_expected = bool(bug.expected_answer)
    if has_expected:
        metrics.append(
            ContextualPrecisionMetric(
                threshold=settings.contextual_precision_threshold,
                model=m,
                include_reason=True,
            )
        )
        metrics.append(
            ContextualRecallMetric(
                threshold=settings.contextual_recall_threshold,
                model=m,
                include_reason=True,
            )
        )

    scores: list[MetricScore] = []
    for m in metrics:
        scores.append(_run_metric(m, test_case))

    score_map = {s.name: s.score for s in scores}
    root_cause = classify_root_cause(score_map)
    explanation = explain_root_cause(root_cause, score_map)
    fixes = suggest_fixes(root_cause, score_map)
    llm_insight = try_llm_evaluation_insights(bug, root_cause, scores, m)
    if llm_insight:
        explanation, fixes = llm_insight

    return EvaluationResult(
        bug_id=bug.id,
        scores=scores,
        root_cause=root_cause,
        root_cause_explanation=explanation,
        fix_suggestions=fixes,
        evaluated_at=datetime.now(timezone.utc).isoformat(),
    )
