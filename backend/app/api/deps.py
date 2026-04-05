from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.database import get_db
from app.db.models import UserModel

security = HTTPBearer(auto_error=False)


def get_current_user(
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(security),
) -> UserModel:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sub = decode_token(creds.credentials)
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        uid = uuid.UUID(sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token subject")
    user = db.query(UserModel).filter(UserModel.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
