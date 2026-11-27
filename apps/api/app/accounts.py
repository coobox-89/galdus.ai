"""Sign-in with Google/GitHub, password reset and change, chat preferences."""
import hashlib
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
from .identity import auth_rate_limit, current_user, make_slug
from .mailer import email_enabled, send
from .models import Membership, Organization, PasswordReset, User, UserIdentity
from .oauth import PROVIDERS, authorize_url, configured, exchange_code, fetch_identity, read_state
from .ratelimit import client_ip, enforce

router = APIRouter(prefix="/api/v1/auth", tags=["accounts"])
LOGIN_PROVIDERS = ("google", "github")
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
    enforce(f"oauth:{client_ip(request)}", 20)
    if provider not in LOGIN_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    extra = {"prompt": "select_account"} if provider == "google" else {}
    return RedirectResponse(authorize_url(provider, "login", PROVIDERS[provider]["login_scope"], extra_params=extra), status_code=302)


async def _login_user(db: AsyncSession, provider: str, ident: dict) -> User:
    identity = await db.scalar(select(UserIdentity).where(UserIdentity.provider == provider, UserIdentity.subject == ident["subject"]))
    if identity:
        return await db.get(User, identity.user_id)
    if not ident["email"] or not ident["verified"]:
        raise HTTPException(status_code=400, detail="Your account has no verified email address with this provider.")
    user = await db.scalar(select(User).where(User.email == ident["email"]))
    if not user:
        name = (ident["name"] or ident["email"].split("@")[0])[:160]
        user = User(email=ident["email"], full_name=name, password_hash=hash_password(secrets.token_urlsafe(32)), has_password=False,
                    is_platform_admin=ident["email"] in settings.admin_email_list)
        org_name = f"{name.split(' ')[0]}'s workspace"
        org = Organization(name=org_name, slug=make_slug(org_name))
        db.add_all([user, org])
        await db.flush()
        db.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
    db.add(UserIdentity(user_id=user.id, provider=provider, subject=ident["subject"], email=ident["email"]))
    await db.commit()
    return user


@router.get("/oauth/{provider}/callback")
async def oauth_callback(provider: str, code: str | None = None, state: str | None = None, error: str | None = None,
                         db: AsyncSession = Depends(get_db)):
    try:
        if error or not code or not state:
            raise HTTPException(status_code=400, detail="Sign-in was cancelled.")
        data = read_state(state)
        if data.get("p") != provider or data.get("purpose") != "login":
            raise HTTPException(status_code=400, detail="Invalid sign-in state. Please try again.")
        tokens = await exchange_code(provider, "login", code, data)
        user = await _login_user(db, provider, await fetch_identity(provider, tokens["access_token"]))
    except HTTPException as exc:
        return RedirectResponse(_frontend(f"oauth?error={quote(str(exc.detail))}"), status_code=302)
    token = create_access_token(str(user.id))
    return RedirectResponse(_frontend(f"oauth?token={token}&expires_in={settings.jwt_expire_minutes * 60}"), status_code=302)


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
    user = await db.scalar(select(User).where(User.email == str(body.email).lower()))
    if user and email_enabled():
        token = secrets.token_urlsafe(32)
        db.add(PasswordReset(user_id=user.id, token_hash=_hash(token), expires_at=datetime.now(timezone.utc) + timedelta(hours=RESET_HOURS)))
        await db.commit()
        await send(user.email, "Reset your Galdus.ai password", "Reset your password",
                   f"Someone asked to reset the password for {user.email}. The link works once, for {RESET_HOURS} hour.",
                   "Choose a new password", _frontend(f"reset?token={token}"))
    return {"email_enabled": email_enabled()}


@router.post("/password/reset", dependencies=[Depends(auth_rate_limit)])
async def reset(body: ResetIn, db: AsyncSession = Depends(get_db)):
    pr = await db.scalar(select(PasswordReset).where(PasswordReset.token_hash == _hash(body.token)))
    if not pr or pr.used_at or pr.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Ask for a new one.")
    user = await db.get(User, pr.user_id)
    user.password_hash, user.has_password = hash_password(body.password), True
    pr.used_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/password/change")
async def change(body: ChangeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    enforce(f"pwchange:{user.id}", 10)
    if user.has_password and not (body.current_password and verify_password(body.current_password, user.password_hash)):
        raise HTTPException(status_code=400, detail="Your current password is not correct.")
    user.password_hash, user.has_password = hash_password(body.new_password), True
    await db.commit()
    return {"ok": True}


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
