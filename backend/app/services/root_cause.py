from __future__ import annotations

from app.config import settings


def classify_root_cause(scores: dict[str, float]) -> str:
    ctx_rel = scores.get("ContextualRelevancy", 1.0)
    ctx_rec = scores.get("ContextualRecall", 1.0)
    ctx_pre = scores.get("ContextualPrecision", 1.0)
    faith = scores.get("Faithfulness", 1.0)
    hall = scores.get("Hallucination", 0.0)
    ans_rel = scores.get("AnswerRelevancy", 1.0)

    if ctx_rel < settings.rc_retrieval_failure_ctx_relevancy and ctx_rec < settings.rc_retrieval_failure_ctx_recall:
        return "RETRIEVAL_FAILURE"
    if ctx_pre < settings.rc_ranking_issue_ctx_precision and ctx_rec >= settings.rc_ranking_issue_ctx_recall_min:
        return "RANKING_ISSUE"
    if faith < settings.rc_generation_failure_faithfulness and ctx_rel >= settings.rc_generation_failure_ctx_relevancy_min:
        return "GENERATION_FAILURE"
    if hall > settings.rc_hallucination_score:
        return "HALLUCINATION"
    if ans_rel < settings.rc_irrelevant_answer_relevancy:
        return "IRRELEVANT_ANSWER"
    return "ACCEPTABLE"


_EXPLANATIONS = {
    "RETRIEVAL_FAILURE": (
        "The retrieved chunks are not relevant to the user's question and do not "
        "contain the information needed to answer it. The retrieval pipeline failed "
        "to find the right documents."
    ),
    "RANKING_ISSUE": (
        "The relevant information exists in the retrieved chunks but is ranked too "
        "low. The top-ranked chunks are less relevant than lower-ranked ones."
    ),
    "GENERATION_FAILURE": (
        "The retrieved context was relevant, but the LLM failed to generate a "
        "faithful answer from it. The model ignored or misinterpreted the context."
    ),
    "HALLUCINATION": (
        "The LLM generated claims that are not supported by the retrieved context. "
        "Parts of the answer are fabricated."
    ),
    "IRRELEVANT_ANSWER": (
        "The generated answer does not address the user's question, even though "
        "the context may be adequate."
    ),
    "ACCEPTABLE": (
        "All evaluation metrics are within acceptable thresholds. The response "
        "appears to be correct based on the provided context."
    ),
}


def explain_root_cause(root_cause: str, scores: dict[str, float]) -> str:
    base = _EXPLANATIONS.get(root_cause, "")
    low_scores = [f"{k}: {v:.2f}" for k, v in scores.items() if v < 0.5]
    if low_scores:
        base += f" Low scoring metrics: {', '.join(low_scores)}."
    return base
