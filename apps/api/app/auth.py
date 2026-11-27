from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from .config import settings

# Argon2id with OWASP's recommended minimum (19 MiB, 2 iterations, 1 lane). pwdlib's default (64 MiB, 3, 4)
# took about 1.5 s of CPU per sign-in on a 0.1-CPU instance (Render free). Older hashes still verify and
# are upgraded to these parameters at the next successful sign-in (verify_and_rehash).
password_hash = PasswordHash((Argon2Hasher(memory_cost=19_456, time_cost=2, parallelism=1),))

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)

def verify_and_rehash(password: str, hashed: str) -> tuple[bool, str | None]:
    """(valid, new hash when the stored one uses older parameters)."""
    return password_hash.verify_and_update(password, hashed)

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


MFA_AUDIENCE = "galdus-mfa"


def create_mfa_token(subject: str) -> str:
    """Short-lived proof that the password (or OAuth) step passed; only exchangeable for a session with a second factor.
    The audience makes it unusable as an access token."""
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": subject, "aud": MFA_AUDIENCE, "iat": now, "exp": now + timedelta(minutes=5)}, settings.jwt_secret, algorithm="HS256")


def decode_mfa_token(token: str) -> str:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience=MFA_AUDIENCE)
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise jwt.InvalidTokenError("Missing subject")
    return subject
