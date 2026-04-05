"""Chat completions: some models reject max_tokens and require max_completion_tokens."""

from __future__ import annotations

from typing import Any

from openai import OpenAI


def chat_completions_create(
    client: OpenAI,
    *,
    max_output_tokens: int,
    **kwargs: Any,
):
    """
    Call chat.completions.create with an output token limit.
    Retries with max_completion_tokens if the API rejects max_tokens.
    """
    try:
        return client.chat.completions.create(**kwargs, max_tokens=max_output_tokens)
    except Exception as e:
        msg = str(e).lower()
        if (
            "max_completion_tokens" in msg
            or ("max_tokens" in msg and ("unsupported" in msg or "invalid_request" in msg))
        ):
            return client.chat.completions.create(
                **kwargs,
                max_completion_tokens=max_output_tokens,
            )
        raise
