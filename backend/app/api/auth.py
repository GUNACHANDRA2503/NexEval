from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.database import get_db
from app.db.models import UserModel
from app.schemas import TokenResponse, UserLogin, UserMe, UserRegister

router = APIRouter(tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/auth/register", response_model=TokenResponse)
def register(body: UserRegister, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email")
    if db.query(UserModel).filter(UserModel.email == email).first():
        raise HTTPException(400, "Email already registered")
    try:
        pw_hash = hash_password(body.password)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    user = UserModel(
        id=uuid.uuid4(),
        email=email,
        password_hash=pw_hash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/auth/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(UserModel).filter(UserModel.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


def _user_me(user: UserModel) -> UserMe:
    sm = user.saved_models if isinstance(user.saved_models, list) else []
    cleaned = [str(x).strip() for x in sm if str(x).strip()]
    return UserMe(
        id=str(user.id),
        email=user.email,
        preferred_model=user.preferred_model,
        saved_models=cleaned,
        freya_enabled=bool(user.freya_enabled),
    )


@router.get("/auth/me", response_model=UserMe)
def read_me(user: UserModel = Depends(get_current_user)):
    return _user_me(user)
