from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import UserModel, UserOpenAICredentialModel
from app.api.auth import _user_me
from app.core.security import hash_password, verify_password
from app.schemas import (
    OpenAIKeyBody,
    OpenAIKeyStatus,
    PasswordChangeRequest,
    PreferencesUpdate,
    UserMe,
)
from app.services.crypto_credentials import encrypt_secret
from app.services.openai_user import resolve_openai_api_key
from app.services.usage_estimate import chat_models_filter
from app.store import store

router = APIRouter(tags=["account"])

_models_cache: dict[str, tuple[float, list[str]]] = {}
CACHE_TTL = 600.0


@router.get("/account/openai-key", response_model=OpenAIKeyStatus)
def openai_key_status(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    row = (
        db.query(UserOpenAICredentialModel)
        .filter(UserOpenAICredentialModel.user_id == user.id)
        .first()
    )
    if row and row.encrypted_api_key:
        return OpenAIKeyStatus(configured=True, key_last_four=row.key_last_four or "****")
    return OpenAIKeyStatus(configured=False, key_last_four="")


@router.post("/account/openai-key", response_model=OpenAIKeyStatus)
def save_openai_key(
    body: OpenAIKeyBody,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = body.api_key.strip()
    try:
        client = OpenAI(api_key=key)
        client.models.list()
    except Exception as e:
        raise HTTPException(400, f"Invalid API key or OpenAI error: {e}") from e

    enc = encrypt_secret(key)
    last4 = key[-4:] if len(key) >= 4 else "****"
    row = (
        db.query(UserOpenAICredentialModel)
        .filter(UserOpenAICredentialModel.user_id == user.id)
        .first()
    )
    if row:
        row.encrypted_api_key = enc
        row.key_last_four = last4
    else:
        row = UserOpenAICredentialModel(
            user_id=user.id,
            encrypted_api_key=enc,
            key_last_four=last4,
        )
        db.add(row)
    db.commit()
    _models_cache.pop(str(user.id), None)
    return OpenAIKeyStatus(configured=True, key_last_four=last4)


@router.post("/account/password")
def change_password(
    body: PasswordChangeRequest,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    try:
        user.password_hash = hash_password(body.new_password)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    db.commit()
    return {"ok": True}


@router.delete("/account/openai-key")
def delete_openai_key(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    row = (
        db.query(UserOpenAICredentialModel)
        .filter(UserOpenAICredentialModel.user_id == user.id)
        .first()
    )
    if row:
        db.delete(row)
        db.commit()
    _models_cache.pop(str(user.id), None)
    return {"deleted": True}


@router.get("/account/openai/models")
def list_openai_models(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    api_key = resolve_openai_api_key(db, user)
    if not api_key:
        raise HTTPException(400, "Add an OpenAI API key in Account first.")
    cache_key = str(user.id)
    now = time.time()
    if cache_key in _models_cache and now - _models_cache[cache_key][0] < CACHE_TTL:
        return {"models": _models_cache[cache_key][1]}
    try:
        client = OpenAI(api_key=api_key)
        data = client.models.list()
        out = sorted({m.id for m in data.data if chat_models_filter(m.id)})
        _models_cache[cache_key] = (now, out)
        return {"models": out}
    except Exception as e:
        raise HTTPException(502, f"Failed to list models: {e}") from e


@router.patch("/account/preferences", response_model=UserMe)
def patch_preferences(
    body: PreferencesUpdate,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.preferred_model is not None:
        user.preferred_model = body.preferred_model.strip() or None
    if body.saved_models is not None:
        seen: set[str] = set()
        ordered: list[str] = []
        for x in body.saved_models:
            s = str(x).strip()
            if not s or s in seen:
                continue
            seen.add(s)
            ordered.append(s)
        user.saved_models = ordered
    if body.freya_enabled is not None:
        user.freya_enabled = bool(body.freya_enabled)

    sm = user.saved_models if isinstance(user.saved_models, list) else []
    sm_set = {str(x).strip() for x in sm if str(x).strip()}
    if sm_set and user.preferred_model and user.preferred_model.strip() not in sm_set:
        user.preferred_model = sorted(sm_set)[0]
    elif not sm_set:
        user.preferred_model = None

    db.commit()
    db.refresh(user)
    return _user_me(user)


@router.get("/account/usage")
def account_usage(
    days: int = 30,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))
    summary = store.usage_summary(db, user.id, since=since, limit_rows=200)
    return {
        "disclaimer": "Token and cost figures are estimates based on DeepEval usage patterns.",
        **summary,
    }
