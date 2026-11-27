"""Sign-in with Google, GitHub and Microsoft, password reset and change, chat preferences."""
import hashlib
import re
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import create_access_token, hash_password, verify_password
from .config import settings
from .db import get_db
from .identity import auth_rate_limit, current_user, grant_admin_if_listed, make_slug
from .mailer import email_enabled, send
from .models import EmailVerification, Membership, Organization, PasswordReset, User, UserIdentity
from .oauth import PROVIDERS, authorize_url, configured, exchange_code, fetch_identity, read_state
from .ratelimit import client_ip, enforce

OAUTH_COOKIE = "galdus_oauth"

router = APIRouter(prefix="/api/v1/auth", tags=["accounts"])
LOGIN_PROVIDERS = ("google", "github", "microsoft")
# Providers whose email claim is not proof of ownership (Microsoft lets tenant admins set any address):
# they can create a new, unverified account but never take over an existing one by email.
UNVERIFIED_EMAIL_PROVIDERS = ("microsoft",)
RESET_HOURS = 1


def _frontend(fragment: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/#/{fragment}"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.get("/providers")
async def providers():
    return {"login": [p for p in LOGIN_PROVIDERS if configured(p)], "email": email_enabled()}


@router.get("/oauth/{provider}/start")
async def oauth_start(provider: str, request: Request):
    await enforce(f"oauth:{client_ip(request)}", 20)
    if provider not in LOGIN_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    extra = {"prompt": "select_account"} if provider in ("google", "microsoft") else {}
    # Bind the flow to this browser: the callback must come back with the same cookie (prevents login CSRF).
    nonce = secrets.token_urlsafe(24)
    url = authorize_url(provider, "login", PROVIDERS[provider]["login_scope"], extra_state={"n": _hash(nonce)}, extra_params=extra)
    resp = RedirectResponse(url, status_code=302)
    resp.set_cookie(OAUTH_COOKIE, nonce, max_age=600, httponly=True, secure=settings.is_production, samesite="lax", path="/api/v1/auth/oauth")
    return resp


async def _login_user(db: AsyncSession, provider: str, ident: dict) -> User:
    identity = await db.scalar(select(UserIdentity).where(UserIdentity.provider == provider, UserIdentity.subject == ident["subject"]))
    if identity:
        user = await db.get(User, identity.user_id)
        if user is None:
            raise HTTPException(status_code=400, detail="This sign-in is no longer linked to an account.")
        return user
    if not ident["subject"] or ident["subject"] == "None":
        raise HTTPException(status_code=400, detail="The provider did not return an account identifier.")
    if not ident["email"]:
        raise HTTPException(status_code=400, detail="Your account has no email address with this provider.")
    trusted = bool(ident["verified"]) and provider not in UNVERIFIED_EMAIL_PROVIDERS
    user = await db.scalar(select(User).where(User.email == ident["email"]))
    if user and not trusted:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in with your password "
                                                    "or the provider you used before.")
    if not user and provider not in UNVERIFIED_EMAIL_PROVIDERS and not ident["verified"]:
        raise HTTPException(status_code=400, detail="Your account has no verified email address with this provider.")
    created = False
    if not user:
        name = (ident["name"] or ident["email"].split("@")[0])[:160]
        user = User(email=ident["email"], full_name=name, password_hash=hash_password(secrets.token_urlsafe(32)), has_password=False,
                    email_verified_at=datetime.now(timezone.utc) if trusted else None)
        org_name = f"{name.split(' ')[0]}'s workspace"
        org = Organization(name=org_name, slug=make_slug(org_name))
        db.add_all([user, org])
        await db.flush()
        db.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
        created = True
    db.add(UserIdentity(user_id=user.id, provider=provider, subject=ident["subject"], email=ident["email"]))
    if user.email_verified_at is None and trusted:
        user.email_verified_at = datetime.now(timezone.utc)  # the provider verified this address
    grant_admin_if_listed(user)
    await db.commit()
    if created and not trusted:
        await send_verification(db, user)
    return user


@router.get("/oauth/{provider}/callback")
async def oauth_callback(provider: str, request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
                         db: AsyncSession = Depends(get_db)):
    try:
        if error or not code or not state:
            raise HTTPException(status_code=400, detail="Sign-in was cancelled.")
        data = read_state(state)
        if data.get("p") != provider or data.get("purpose") != "login":
            raise HTTPException(status_code=400, detail="Invalid sign-in state. Please try again.")
        nonce = request.cookies.get(OAUTH_COOKIE, "")
        if not nonce or not hmac.compare_digest(_hash(nonce), str(data.get("n", ""))):
            raise HTTPException(status_code=400, detail="Sign-in must start and finish in the same browser. Please try again.")
        tokens = await exchange_code(provider, "login", code, data)
        user = await _login_user(db, provider, await fetch_identity(provider, tokens["access_token"]))
    except HTTPException as exc:
        resp = RedirectResponse(_frontend(f"oauth?error={quote(str(exc.detail))}"), status_code=302)
        resp.delete_cookie(OAUTH_COOKIE, path="/api/v1/auth/oauth")
        return resp
    if user.mfa_enabled:
        from .auth import create_mfa_token
        resp = RedirectResponse(_frontend(f"oauth?mfa_token={create_mfa_token(str(user.id))}"), status_code=302)
        resp.delete_cookie(OAUTH_COOKIE, path="/api/v1/auth/oauth")
        return resp
    token = create_access_token(str(user.id))
    resp = RedirectResponse(_frontend(f"oauth?token={token}&expires_in={settings.jwt_expire_minutes * 60}"), status_code=302)
    resp.delete_cookie(OAUTH_COOKIE, path="/api/v1/auth/oauth")
    return resp


# ---- Password reset / change -----------------------------------------------

class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=12, max_length=128)


class ChangeIn(BaseModel):
    current_password: str | None = Field(default=None, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


@router.post("/password/forgot", status_code=202, dependencies=[Depends(auth_rate_limit)])
async def forgot(body: ForgotIn, db: AsyncSession = Depends(get_db)):
    """Always 202, so the response does not reveal whether an account exists."""
    email = str(body.email).lower()
    user = await db.scalar(select(User).where(User.email == email))
    try:
        # At most 3 reset emails per address per hour, silently: the answer stays the same.
        await enforce(f"forgot:{email}", 3, 3600)
    except HTTPException:
        return {"email_enabled": email_enabled()}
    if user and email_enabled():
        token = secrets.token_urlsafe(32)
        db.add(PasswordReset(user_id=user.id, token_hash=_hash(token), expires_at=datetime.now(timezone.utc) + timedelta(hours=RESET_HOURS)))
        await db.commit()
        await send(user.email, "Reset your Galdus.ai password", "Reset your password",
                   f"Someone asked to reset the password for {user.email}. Choose a new one with the button below. The link works once, for {RESET_HOURS} hour.",
                   "Choose a new password", _frontend(f"reset?token={token}"),
                   "If you did not ask for this, ignore this email: your password stays the same.")
    return {"email_enabled": email_enabled()}


@router.post("/password/reset", dependencies=[Depends(auth_rate_limit)])
async def reset(body: ResetIn, db: AsyncSession = Depends(get_db)):
    pr = await db.scalar(select(PasswordReset).where(PasswordReset.token_hash == _hash(body.token)))
    if not pr or pr.used_at or pr.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Ask for a new one.")
    user = await db.get(User, pr.user_id)
    if user.email_verified_at is None:
        # Sign-ins linked before anyone proved this address (e.g. a Microsoft tenant that set someone
        # else's email) are dropped: the person who controls the mailbox gets a clean account.
        from sqlalchemy import delete
        await db.execute(delete(UserIdentity).where(UserIdentity.user_id == user.id))
    user.password_hash, user.has_password = hash_password(body.password), True
    user.tokens_valid_after = _revoke_now()
    user.email_verified_at = user.email_verified_at or datetime.now(timezone.utc)  # the reset link proved the address
    grant_admin_if_listed(user)
    pr.used_at = datetime.now(timezone.utc)
    # Every other reset link for this account stops working too.
    from sqlalchemy import update
    await db.execute(update(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
                     .values(used_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"ok": True}


@router.post("/password/change")
async def change(body: ChangeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await enforce(f"pwchange:{user.id}", 10)
    if user.has_password and not (body.current_password and verify_password(body.current_password, user.password_hash)):
        raise HTTPException(status_code=400, detail="Your current password is not correct.")
    user.password_hash, user.has_password = hash_password(body.new_password), True
    user.tokens_valid_after = _revoke_now()
    await db.commit()
    # Other devices are signed out; this one gets a fresh token.
    return {"ok": True, "access_token": create_access_token(str(user.id)), "expires_in": settings.jwt_expire_minutes * 60}


@router.post("/logout-all")
async def logout_all(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Sign out every device, including this one."""
    user.tokens_valid_after = _revoke_now()
    await db.commit()
    return {"ok": True}


def _revoke_now() -> datetime:
    # JWT iat has one-second precision; tokens issued in an earlier second are rejected.
    return datetime.now(timezone.utc).replace(microsecond=0)


# ---- Chat preferences ----------------------------------------------------------

class PrefsIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    custom_instructions: str = Field(default="", max_length=4000)
    response_style: str = Field(default="balanced", pattern="^(concise|balanced|detailed)$")


@router.get("/preferences")
async def get_prefs(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    ids = (await db.execute(select(UserIdentity.provider).where(UserIdentity.user_id == user.id))).scalars().all()
    return {"full_name": user.full_name, "custom_instructions": user.custom_instructions, "response_style": user.response_style,
            "has_password": user.has_password, "linked_providers": sorted(set(ids))}


@router.put("/preferences")
async def put_prefs(body: PrefsIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    user.full_name, user.custom_instructions, user.response_style = body.full_name.strip(), body.custom_instructions.strip(), body.response_style
    await db.commit()
    return await get_prefs(user, db)


# ---- Email verification -----------------------------------------------------

VERIFY_HOURS = 48


async def send_verification(db: AsyncSession, user: User) -> bool:
    """Email a single-use link that confirms the address. Best effort when email is not configured."""
    if user.email_verified_at or not email_enabled():
        return False
    token = secrets.token_urlsafe(32)
    db.add(EmailVerification(user_id=user.id, token_hash=_hash(token), expires_at=datetime.now(timezone.utc) + timedelta(hours=VERIFY_HOURS)))
    await db.commit()
    first = (user.full_name or "").split(" ")[0] or "there"
    return await send(user.email, "Confirm your email for Galdus.ai", f"Welcome, {first}",
                      f"One last step: confirm that {user.email} is your address, so we can keep your account safe and reach you about it. "
                      f"The link is valid for {VERIFY_HOURS} hours.",
                      "Confirm my email", _frontend(f"verify?token={token}"),
                      "You get this email because this address was used to create a Galdus.ai account. If it was not you, ignore it.")


async def notify_existing_account(user: User) -> bool:
    """Someone tried to register an address that already has an account: tell its owner, privately."""
    return await send(user.email, "Your Galdus.ai account", "You already have an account",
                      f"Someone, maybe you, tried to create a new Galdus.ai account with {user.email}. This address already has "
                      "an account, so nothing was created. Sign in, or choose a new password if you forgot it.",
                      "Sign in to Galdus.ai", _frontend("home"),
                      "If it was not you, you can ignore this email: your account is unchanged.")


class VerifyIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


@router.post("/verify-email", dependencies=[Depends(auth_rate_limit)])
async def verify_email(body: VerifyIn, db: AsyncSession = Depends(get_db)):
    ev = await db.scalar(select(EmailVerification).where(EmailVerification.token_hash == _hash(body.token)))
    if not ev or ev.used_at or ev.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This link is invalid or has expired. Ask for a new one from your account.")
    user = await db.get(User, ev.user_id)
    now = datetime.now(timezone.utc)
    ev.used_at = now
    if user and not user.email_verified_at:
        user.email_verified_at = now
    if user:
        grant_admin_if_listed(user)
    await db.commit()
    return {"ok": True, "email": user.email if user else None}


@router.post("/verify-email/resend")
async def resend_verification(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await enforce(f"verify-resend:{user.id}", 3)
    if user.email_verified_at:
        return {"sent": False, "verified": True}
    return {"sent": await send_verification(db, user), "verified": False}


# ---- Profile ----------------------------------------------------------------

MAX_AVATAR_BYTES = 150_000


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)


class AvatarIn(BaseModel):
    image: str = Field(min_length=30, max_length=220_000)


@router.put("/me/profile")
async def update_profile(body: ProfileIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    name = body.full_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Your name cannot be blank")
    user.full_name = name
    await db.commit()
    return {"full_name": user.full_name}


@router.put("/me/avatar")
async def update_avatar(body: AvatarIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    import base64
    import binascii
    m = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", body.image)
    if not m:
        raise HTTPException(status_code=400, detail="Use a PNG, JPEG or WebP image")
    try:
        data = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="The image could not be read")
    ok = data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff") or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")
    if not ok:
        raise HTTPException(status_code=400, detail="The file is not a valid image")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="The photo is too large. Try a smaller one.")
    user.avatar = body.image
    await db.commit()
    return {"avatar": user.avatar}


@router.delete("/me/avatar")
async def delete_avatar(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    user.avatar = None
    await db.commit()
    return {"avatar": None}
