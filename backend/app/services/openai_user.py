from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import UserModel, UserOpenAICredentialModel
from app.services.crypto_credentials import decrypt_secret

# Fallback model id when user has no preferred_model (not read from .env)
DEFAULT_EVAL_MODEL = "gpt-4o-mini"


def resolve_openai_api_key(db: Session, user: UserModel) -> str | None:
    """Return only the authenticated user's stored OpenAI key (BYOK). No server .env fallback."""
    row = (
        db.query(UserOpenAICredentialModel)
        .filter(UserOpenAICredentialModel.user_id == user.id)
        .first()
    )
    if row and row.encrypted_api_key:
        key = decrypt_secret(row.encrypted_api_key)
        if key:
            return key
    return None


def effective_eval_model(user: UserModel) -> str:
    if user.preferred_model and user.preferred_model.strip():
        return user.preferred_model.strip()
    return DEFAULT_EVAL_MODEL
