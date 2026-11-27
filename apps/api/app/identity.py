import re
import uuid
from datetime import datetime, timezone
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from .auth import create_access_token, decode_access_claims, hash_password, verify_and_rehash, verify_password
from .config import settings
from .db import get_db
from .models import Membership, Organization, User
from .ratelimit import auth_rate_limit, login_failures

router = APIRouter(prefix="/api/v1/auth", tags=["identity"])
bearer = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# Used to keep login timing similar whether or not the account exists.
_DUMMY_HASH = hash_password("galdus-timing-equalizer-not-a-real-password")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    full_name: str = Field(min_length=1, max_length=160)
    organization_name: str = Field(min_length=2, max_length=160)

    @field_validator("full_name", "organization_name")
    @classmethod
    def reject_blank_names(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_platform_admin: bool = False
    email_verified: bool = False
    # True when email is configured on the server and this address is not verified yet.
    email_verification_pending: bool = False
    mfa_enabled: bool = False
    avatar: str | None = None
    # First-run tour: pending (show it), completed or skipped.
    onboarding: str = "pending"


class RegisterPending(BaseModel):
    """Returned instead of a session when the address must be confirmed first (REQUIRE_EMAIL_VERIFICATION)."""
    verification_required: bool = True
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: str


def _unauthorized(detail: str = "Invalid or expired access token") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


async def current_user(token: str = Depends(bearer), db: AsyncSession = Depends(get_db)) -> User:
    try:
        subject, issued_at = decode_access_claims(token)
        user_id = uuid.UUID(subject)
    except (jwt.InvalidTokenError, ValueError, RuntimeError):
        raise _unauthorized()
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise _unauthorized()
    if user.tokens_valid_after and issued_at < int(user.tokens_valid_after.timestamp()):
        raise _unauthorized()
    return user


async def current_membership(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    x_organization_id: str | None = Header(default=None),
) -> Membership:
    """Resolve the organization the request acts in and enforce membership.

    If the X-Organization-Id header is absent, the user's oldest membership is used.
    Every tenant-owned endpoint must depend on this (or an equivalent check).
    """
    query = select(Membership).where(Membership.user_id == user.id)
    if x_organization_id:
        try:
            org_id = uuid.UUID(x_organization_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid X-Organization-Id header")
        query = query.where(Membership.organization_id == org_id)
    membership = await db.scalar(query.order_by(Membership.created_at).limit(1))
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this organization")
    return membership


def grant_admin_if_listed(user: User) -> None:
    """ADMIN_EMAILS grants the platform console, but in production only to an address that is proven:
    verified by email, by the reset link or by Google/GitHub. Otherwise anyone could register the
    listed address first and become platform admin. Outside production it applies on registration."""
    if user.email.lower() not in settings.admin_email_list:
        return
    if user.email_verified_at is not None or not settings.is_production:
        user.is_platform_admin = True


def make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "workspace"
    return f"{base}-{uuid.uuid4().hex[:8]}"


def _user_response(user: User) -> UserResponse:
    from .mailer import email_enabled
    verified = user.email_verified_at is not None
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name, is_platform_admin=bool(user.is_platform_admin),
                        email_verified=verified, email_verification_pending=not verified and email_enabled(),
                        mfa_enabled=bool(user.mfa_enabled), avatar=user.avatar, onboarding=user.onboarding_status or "pending")


def session_or_mfa(user: User) -> dict:
    """After the first factor: a session, or a short-lived token for the second step when MFA is on."""
    if user.mfa_enabled:
        from .auth import create_mfa_token
        return {"mfa_required": True, "mfa_token": create_mfa_token(str(user.id))}
    return _token_response(user).model_dump(mode="json")


async def require_platform_admin(user: User = Depends(current_user)) -> User:
    if not user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform administrator access required")
    return user


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        expires_in=settings.jwt_expire_minutes * 60,
        user=_user_response(user),
    )


def _verification_first() -> bool:
    from .mailer import email_enabled
    return settings.require_email_verification and email_enabled()


@router.post("/register", status_code=201, dependencies=[Depends(auth_rate_limit)],
             responses={201: {"model": TokenResponse}, 202: {"model": RegisterPending}})
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create an account and its first workspace.

    With REQUIRE_EMAIL_VERIFICATION and SMTP configured, the answer is always 202 "check your inbox",
    whether or not the address already has an account, so the endpoint cannot be used to find out who
    is registered; the owner of an existing account gets a notice instead. Without email the API cannot
    stay silent and answers 409 for a taken address (see docs/security/overview.md, residual risks).
    """
    from fastapi.responses import JSONResponse
    email = str(body.email).lower()
    pending = JSONResponse(status_code=202, content=RegisterPending(email=email).model_dump(mode="json"))
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        if _verification_first():
            from .accounts import notify_existing_account
            await notify_existing_account(existing)
            return pending
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password))
    grant_admin_if_listed(user)
    org = Organization(name=body.organization_name, slug=make_slug(body.organization_name))
    db.add_all([user, org])
    try:
        await db.flush()
        db.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
        await db.commit()
    except IntegrityError:
        # Concurrent registration with the same email.
        await db.rollback()
        if _verification_first():
            return pending
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    await db.refresh(user)
    from .accounts import send_verification
    await send_verification(db, user)
    if _verification_first():
        return pending
    return _token_response(user)


@router.post("/login", dependencies=[Depends(auth_rate_limit)])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = str(body.email).lower()
    # Checked before the password, and for unknown addresses too, so the lockout does not reveal accounts.
    await login_failures.check(email)
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        verify_password(body.password, _DUMMY_HASH)
        await login_failures.fail(email)
        raise _unauthorized("Invalid email or password")
    valid, upgraded = verify_and_rehash(body.password, user.password_hash)
    if not valid:
        await login_failures.fail(email)
        raise _unauthorized("Invalid email or password")
    if upgraded:
        user.password_hash = upgraded
        await db.commit()
    from .mailer import email_enabled
    if settings.require_email_verification and email_enabled() and user.email_verified_at is None:
        raise HTTPException(status_code=403, detail="Verify your email address first: open the link we sent you, or ask for a new one.")
    return session_or_mfa(user)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(current_user)):
    return _user_response(user)


@router.get("/organizations", response_model=list[OrganizationResponse])
async def organizations(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Organization, Membership.role)
        .join(Membership)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at)
    )
    return [OrganizationResponse(id=org.id, name=org.name, slug=org.slug, role=role) for org, role in result.all()]


class DeleteAccountRequest(BaseModel):
    # Accounts with a password confirm with it; accounts created with Google/GitHub/Microsoft type their email.
    password: str | None = Field(default=None, max_length=128)
    confirm_email: EmailStr | None = None


def _iso(value) -> str | None:
    return value.isoformat() if value else None


@router.get("/export")
async def export_account(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Return the personal data Galdus.ai stores about the caller (GDPR art. 15 and 20).

    Workspace content that belongs to the organization (documents, agents, connections) is exported
    by its owners; this file holds what is linked to the person. Secrets are never included.
    """
    from .models import ChatMessage, Conversation, Run, UsageEvent, UserIdentity
    from .ratelimit import enforce
    await enforce(f"export:{user.id}", 5)
    orgs = await organizations(user=user, db=db)
    usage = (await db.execute(select(UsageEvent).where(UsageEvent.user_id == user.id).order_by(UsageEvent.created_at))).scalars().all()
    identities = (await db.execute(select(UserIdentity).where(UserIdentity.user_id == user.id))).scalars().all()
    convs = (await db.execute(select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.created_at))).scalars().all()
    messages = (await db.execute(select(ChatMessage).join(Conversation, Conversation.id == ChatMessage.conversation_id)
                                 .where(Conversation.user_id == user.id).order_by(ChatMessage.created_at))).scalars().all()
    by_conv: dict = {}
    for m in messages:
        by_conv.setdefault(m.conversation_id, []).append(
            {"role": m.role, "content": m.content, "attachments": m.attachments or [], "model": m.model, "created_at": _iso(m.created_at)})
    runs = (await db.execute(select(Run).where(Run.user_id == user.id).order_by(Run.created_at))).scalars().all()
    return {
        "format": "galdus-account-export/2",
        "exported_at": _iso(datetime.now(timezone.utc)),
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "created_at": _iso(user.created_at),
                 "email_verified_at": _iso(user.email_verified_at), "mfa_enabled": bool(user.mfa_enabled),
                 "has_password": bool(user.has_password), "has_avatar": bool(user.avatar),
                 "custom_instructions": user.custom_instructions, "response_style": user.response_style,
                 "onboarding": user.onboarding_status or "pending"},
        "linked_sign_ins": [{"provider": i.provider, "email": i.email, "linked_at": _iso(i.created_at)} for i in identities],
        "organizations": [o.model_dump(mode="json") for o in orgs],
        "conversations": [{"id": str(c.id), "organization_id": str(c.organization_id), "title": c.title, "persona": c.persona,
                           "model": c.model, "created_at": _iso(c.created_at), "messages": by_conv.get(c.id, [])} for c in convs],
        "runs": [{"id": str(r.id), "organization_id": str(r.organization_id), "agent_id": str(r.agent_id) if r.agent_id else None,
                  "app_id": r.app_id, "trigger": r.trigger, "status": r.status, "input": r.input, "output": r.output,
                  "model": r.model, "created_at": _iso(r.created_at)} for r in runs],
        "usage_events": [
            {"model": u.model, "prompt_tokens": u.prompt_tokens, "completion_tokens": u.completion_tokens,
             "organization_id": str(u.organization_id), "created_at": _iso(u.created_at)}
            for u in usage
        ],
    }


@router.post("/account/delete", status_code=204, dependencies=[Depends(auth_rate_limit)])
async def delete_account(body: DeleteAccountRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Delete the caller and every organization where they are the only member.

    A workspace that has other members and where the caller is the only owner is not deleted silently:
    the caller must first make someone else owner (409), so no team is left without an owner.
    """
    from sqlalchemy import delete, func
    if user.has_password:
        if not (body.password and verify_password(body.password, user.password_hash)):
            raise _unauthorized("Password is incorrect")
    elif not body.confirm_email or str(body.confirm_email).lower() != user.email.lower():
        raise HTTPException(status_code=400, detail="Type your email address to confirm")
    memberships = (await db.execute(select(Membership).where(Membership.user_id == user.id))).scalars().all()
    blocked, solo = [], []
    for m in memberships:
        members = await db.scalar(select(func.count()).select_from(Membership).where(Membership.organization_id == m.organization_id))
        if members == 1:
            solo.append(m.organization_id)
            continue
        if m.role == "owner":
            owners = await db.scalar(select(func.count()).select_from(Membership).where(
                Membership.organization_id == m.organization_id, Membership.role == "owner"))
            if owners == 1:
                org = await db.get(Organization, m.organization_id)
                blocked.append(org.name if org else str(m.organization_id))
    if blocked:
        raise HTTPException(status_code=409, detail="You are the only owner of " + ", ".join(sorted(blocked))
                            + ". Make another member owner in Team, then delete your account.")
    for org_id in solo:
        await db.execute(delete(Organization).where(Organization.id == org_id))
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
