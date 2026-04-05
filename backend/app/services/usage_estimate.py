from __future__ import annotations

import re
from typing import Any

# USD per 1M tokens (rough; update periodically). Input / output split.
_MODEL_PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.6),
    "gpt-4-turbo": (10.0, 30.0),
    "gpt-4": (30.0, 60.0),
    "gpt-3.5-turbo": (0.5, 1.5),
    "gpt-5.4-mini": (0.15, 0.6),
    "o1-mini": (3.0, 12.0),
    "o1": (15.0, 60.0),
    "o3-mini": (1.0, 4.0),
}


def _pricing_for_model(model: str) -> tuple[float, float]:
    m = model.lower().strip()
    for prefix, prices in _MODEL_PRICING.items():
        if m.startswith(prefix) or prefix in m:
            return prices
    return (1.0, 4.0)


def _count_tokens(text: str, model: str) -> int:
    if not text:
        return 0
    try:
        import tiktoken

        try:
            enc = tiktoken.encoding_for_model(model)
        except KeyError:
            enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return max(1, len(text) // 4)


def estimate_eval_tokens_and_cost(bug_data: dict[str, Any], model: str) -> dict[str, Any]:
    """Heuristic: base text + multiplier for DeepEval metric LLM rounds."""
    q = bug_data.get("user_question", "") or ""
    exp = bug_data.get("expected_answer", "") or ""
    act = bug_data.get("actual_answer", "") or ""
    raw = bug_data.get("retrieved_chunks_raw", "") or ""
    chunks = bug_data.get("retrieved_chunks") or []
    chunk_text = ""
    if isinstance(chunks, list):
        for c in chunks:
            if isinstance(c, dict):
                chunk_text += str(c) + "\n"
    base_text = f"{q}\n{exp}\n{act}\n{raw}\n{chunk_text}"
    base_tokens = _count_tokens(base_text, model)

    has_ctx = bool(raw.strip()) or bool(chunks)
    # Without retrieval context only answer relevancy runs (~3 internal calls); full ~6 metrics * several calls
    metric_rounds = 8 if has_ctx else 3
    mult = 6 * metric_rounds if has_ctx else 4

    est_prompt = int(base_tokens * mult * 0.7)
    est_completion = int(base_tokens * mult * 0.3)
    pin, pout = _pricing_for_model(model)
    cost = (est_prompt / 1_000_000) * pin + (est_completion / 1_000_000) * pout

    return {
        "prompt_tokens": est_prompt,
        "completion_tokens": est_completion,
        "total_tokens": est_prompt + est_completion,
        "estimated_cost_usd": round(cost, 6),
    }


def chat_models_filter(model_id: str) -> bool:
    mid = model_id.lower()
    if "embedding" in mid or "moderation" in mid or "whisper" in mid or "tts" in mid:
        return False
    if mid.startswith("gpt-") or mid.startswith("o") or "chat" in mid:
        return True
    if mid.startswith("o1") or mid.startswith("o3"):
        return True
    return bool(re.match(r"^gpt-|^chatgpt-|^o[0-9]", mid))
