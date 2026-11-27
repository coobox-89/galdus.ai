"""Two-step verification with an authenticator app (TOTP, RFC 6238) and single-use recovery codes.

Off by default: each person turns it on from their account. Once on, every sign-in (password,
Google, GitHub or Microsoft) needs a 6-digit code or a recovery code.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import decode_mfa_token, verify_password
from .crypto import decrypt, encrypt
from .db import get_db
from .identity import _token_response, current_user
from .models import User
from .ratelimit import client_ip, enforce, mfa_failures

router = APIRouter(prefix="/api/v1/auth/mfa", tags=["mfa"])

ISSUER = "Galdus.ai"
STEP = 30
DIGITS = 6
RECOVERY_CODES = 10


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 10 ** DIGITS
    return str(value).zfill(DIGITS)


def totp_now(secret: str, at: float | None = None) -> str:
    return _code(secret, int((at or time.time()) // STEP))


def match_step(secret: str, code: str, last_step: int | None, at: float | None = None) -> int | None:
    """Return the time step that matches (allowing one step of clock drift), never one already used."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != DIGITS:
        return None
    current = int((at or time.time()) // STEP)
    for step in (current, current - 1, current + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(_code(secret, step), code):
            return step
    return None


def _hash(code: str) -> str:
    return hashlib.sha256(code.replace("-", "").strip().lower().encode()).hexdigest()


def new_recovery_codes() -> list[str]:
    return [f"{secrets.token_hex(3)}-{secrets.token_hex(3)}" for _ in range(RECOVERY_CODES)]


def check_second_factor(user: User, code: str) -> bool:
    """Verify a TOTP or recovery code and consume it. The caller commits."""
    if not user.mfa_enabled or not user.mfa_secret:
        return False
    step = match_step(decrypt(user.mfa_secret), code, user.mfa_last_step)
    if step is not None:
        user.mfa_last_step = step
        return True
    h = _hash(code)
    if h in (user.mfa_recovery or []):
        user.mfa_recovery = [x for x in user.mfa_recovery if x != h]
        return True
    return False


def otpauth_uri(secret: str, email: str) -> str:
    from urllib.parse import quote
    return f"otpauth://totp/{quote(ISSUER)}:{quote(email)}?secret={secret}&issuer={quote(ISSUER)}&algorithm=SHA1&digits={DIGITS}&period={STEP}"


def qr_svg(data: str) -> str:
    import segno
    import io
    buf = io.BytesIO()
    # omitsize: a viewBox instead of a fixed width/height, so the code scales to its box instead of being
    # cropped (a cropped finder pattern made the code unreadable). border=4: the quiet zone the QR spec requires.
    segno.make(data, error="m").save(buf, kind="svg", scale=10, border=4, dark="#0B1F3B", light="#FFFFFF", xmldecl=False,
                                     svgns=True, omitsize=True)
    return buf.getvalue().decode()


class Code(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class Verify(BaseModel):
    mfa_token: str = Field(min_length=10, max_length=2000)
    code: str = Field(min_length=6, max_length=20)


class Disable(BaseModel):
    code: str = Field(min_length=6, max_length=20)
    password: str | None = Field(default=None, max_length=128)


@router.post("/verify")
async def verify(body: Verify, request: Request, db: AsyncSession = Depends(get_db)):
    """Second step of sign-in: exchange the short-lived MFA token and a code for a session."""
    await enforce(f"mfa:{client_ip(request)}", 10)
    try:
        user_id = uuid.UUID(decode_mfa_token(body.mfa_token))
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(status_code=401, detail="This sign-in step expired. Sign in again.")
    await enforce(f"mfa-user:{user_id}", 5)
    # 6-digit codes: besides 5 tries a minute, at most MFA_MAX_FAILURES wrong codes per lockout window.
    await mfa_failures.check(str(user_id))
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user or not check_second_factor(user, body.code):
        await mfa_failures.fail(str(user_id))
        raise HTTPException(status_code=401, detail="That code is not valid. Check the time on your phone or use a recovery code.")
    await db.commit()
    return _token_response(user)


@router.get("/status")
async def status(user: User = Depends(current_user)):
    return {"enabled": bool(user.mfa_enabled), "recovery_codes_left": len(user.mfa_recovery or [])}


@router.post("/setup")
async def setup(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Start setup: a new secret to scan. Nothing changes for sign-in until it is confirmed."""
    if user.mfa_enabled:
        raise HTTPException(status_code=409, detail="Two-step verification is already on")
    await enforce(f"mfa-setup:{user.id}", 10)
    secret = new_secret()
    user.mfa_secret = encrypt(secret)
    await db.commit()
    uri = otpauth_uri(secret, user.email)
    return {"secret": secret, "otpauth_uri": uri, "qr_svg": qr_svg(uri)}


@router.post("/enable")
async def enable(body: Code, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await enforce(f"mfa-enable:{user.id}", 10)
    if user.mfa_enabled:
        raise HTTPException(status_code=409, detail="Two-step verification is already on")
    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="Start the setup first")
    step = match_step(decrypt(user.mfa_secret), body.code, None)
    if step is None:
        raise HTTPException(status_code=400, detail="That code is not valid. Check the time on your phone and try the newest code.")
    codes = new_recovery_codes()
    user.mfa_enabled, user.mfa_last_step, user.mfa_recovery = True, step, [_hash(c) for c in codes]
    await db.commit()
    return {"enabled": True, "recovery_codes": codes}


@router.post("/recovery-codes")
async def regenerate(body: Code, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await enforce(f"mfa-codes:{user.id}", 5)
    await mfa_failures.check(str(user.id))
    if not check_second_factor(user, body.code):
        await mfa_failures.fail(str(user.id))
        raise HTTPException(status_code=400, detail="That code is not valid")
    codes = new_recovery_codes()
    user.mfa_recovery = [_hash(c) for c in codes]
    await db.commit()
    return {"recovery_codes": codes}


@router.post("/disable")
async def disable(body: Disable, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await enforce(f"mfa-disable:{user.id}", 5)
    if not user.mfa_enabled:
        return {"enabled": False}
    if user.has_password and not (body.password and verify_password(body.password, user.password_hash)):
        raise HTTPException(status_code=400, detail="Your password is not correct")
    await mfa_failures.check(str(user.id))
    if not check_second_factor(user, body.code):
        await mfa_failures.fail(str(user.id))
        raise HTTPException(status_code=400, detail="That code is not valid")
    user.mfa_enabled, user.mfa_secret, user.mfa_recovery, user.mfa_last_step = False, None, [], None
    await db.commit()
    return {"enabled": False}
