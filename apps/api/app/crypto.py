"""Encryption of tenant secrets (provider API keys) at rest.

Keys are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) using a key derived
from ENCRYPTION_KEY. Rotating that variable makes stored keys unreadable,
so it must be backed up with the database.
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


class SecretUnavailable(RuntimeError):
    pass


def _fernet() -> Fernet:
    secret = settings.encryption_key or ""
    if len(secret) < 32:
        raise SecretUnavailable("ENCRYPTION_KEY must be set (at least 32 characters) to store provider keys")
    key = base64.urlsafe_b64encode(hashlib.sha256(("galdus-provider-keys:" + secret).encode()).digest())
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise SecretUnavailable("Stored credential cannot be decrypted with the current key") from exc


def hint(value: str) -> str:
    """Last four characters only, for display."""
    return f"…{value[-4:]}" if len(value) >= 8 else "…"
