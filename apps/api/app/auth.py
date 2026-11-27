from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from .config import settings

password_hash = PasswordHash.recommended()

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)

def create_access_token(subject: str) -> str:
    if len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must be set to a random secret of at least 32 characters")
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": subject, "exp": expires, "iat": datetime.now(timezone.utc)}, settings.jwt_secret, algorithm="HS256")

def decode_access_token(token: str) -> str:
    return decode_access_claims(token)[0]


def decode_access_claims(token: str) -> tuple[str, int]:
    if len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must be set to a random secret of at least 32 characters")
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise jwt.InvalidTokenError("Missing subject")
    return subject, int(payload.get("iat", 0))
