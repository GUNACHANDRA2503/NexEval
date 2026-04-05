from __future__ import annotations


_FIX_MAP: dict[str, list[str]] = {
    "RETRIEVAL_FAILURE": [
        "Verify that the expected document is indexed in the vector store.",
        "Re-index the relevant documents with a smaller chunk size or increased overlap.",
        "Check if the embedding model captures the domain terminology in the user's question.",
        "Try boosting keyword (BM25) weight in the hybrid search to surface exact-match documents.",
        "Consider adding metadata filters (INS ID, module) to narrow retrieval scope.",
    ],
    "RANKING_ISSUE": [
        "Increase the keyword (BM25) weight relative to semantic similarity in hybrid search.",
        "Re-rank retrieved chunks using a cross-encoder re-ranker before passing to the LLM.",
        "Reduce the number of top-K chunks to filter out noise from irrelevant results.",
        "Add metadata-based boosting so that documents matching the user's INS ID rank higher.",
    ],
    "GENERATION_FAILURE": [
        "Add a stronger system prompt instructing the LLM to answer ONLY from the provided context.",
        "Reduce the LLM temperature to 0 or near-0 for more deterministic, grounded responses.",
        "Pass fewer but more relevant chunks to reduce context window noise.",
        "Try a different LLM model that follows instructions more faithfully.",
    ],
    "HALLUCINATION": [
        "Add explicit instructions: 'If the answer is not in the context, say I don't know.'",
        "Lower the LLM temperature to reduce creative generation.",
        "Post-process the response by verifying each claim against the context.",
        "Use a hallucination detection guardrail before returning the response to the user.",
    ],
    "IRRELEVANT_ANSWER": [
        "The LLM may have misunderstood the question. Try rephrasing in the system prompt.",
        "Ensure the system prompt explicitly asks the LLM to answer the user's specific question.",
        "Check if the question is too vague and suggest the user rephrase with more specific terms.",
    ],
    "ACCEPTABLE": [
        "The response appears correct. If the user still reports an issue, verify the expected answer.",
        "Consider if the user's expectation is too specific (e.g., exact wording vs. semantic match).",
    ],
}


def suggest_fixes(root_cause: str, scores: dict[str, float]) -> list[str]:
    return _FIX_MAP.get(root_cause, ["No specific fix suggestions available."])
