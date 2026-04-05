from __future__ import annotations

from openai import OpenAI

from app.config import settings
from app.services.openai_chat_compat import chat_completions_create
from app.services.openai_user import DEFAULT_EVAL_MODEL


def rephrase_question(
    question: str,
    context: str = "",
    *,
    api_key: str,
    model: str | None = None,
) -> list[str]:
    """Generate rephrased variants of a question for better retrieval."""
    m = (model or "").strip() or DEFAULT_EVAL_MODEL
    client = OpenAI(api_key=api_key)

    system = settings.rephraser_system_prompt.format(
        variant_count=settings.rephraser_variant_count
    )
    user_msg = f"Original question: {question}"
    if context:
        user_msg += f"\n\nAdditional context: {context}"

    response = chat_completions_create(
        client,
        max_output_tokens=settings.rephraser_max_tokens,
        model=m,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        temperature=settings.rephraser_temperature,
    )

    text = response.choices[0].message.content or ""
    lines = [
        line.strip().lstrip("0123456789.)-").strip()
        for line in text.strip().split("\n")
        if line.strip()
    ]
    return [l for l in lines if l]
