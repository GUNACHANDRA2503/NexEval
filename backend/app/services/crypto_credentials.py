from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet_key_bytes() -> bytes:
    raw = (settings.nexeval_credentials_key or "").strip()
    if raw:
        return raw.encode("utf-8")
    digest = hashlib.sha256(settings.jwt_secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_secret(plain: str) -> str:
    f = Fernet(_fernet_key_bytes())
    return f.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str | None:
    try:
        f = Fernet(_fernet_key_bytes())
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
