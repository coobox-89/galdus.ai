import re
import uuid
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from .auth import create_access_token, decode_access_token, hash_password, verify_password
from .config import settings
from .db import get_db
from .models import Membership, Organization, User
from .ratelimit import auth_rate_limit

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
        user_id = uuid.UUID(decode_access_token(token))
    except (jwt.InvalidTokenError, ValueError, RuntimeError):
        raise _unauthorized()
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
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


def make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "workspace"
    return f"{base}-{uuid.uuid4().hex[:8]}"


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        expires_in=settings.jwt_expire_minutes * 60,
        user=UserResponse(id=user.id, email=user.email, full_name=user.full_name),
    )


@router.post("/register", response_model=TokenResponse, status_code=201, dependencies=[Depends(auth_rate_limit)])
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    email = str(body.email).lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password))
    org = Organization(name=body.organization_name, slug=make_slug(body.organization_name))
    db.add_all([user, org])
    try:
        await db.flush()
        db.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
        await db.commit()
    except IntegrityError:
        # Concurrent registration with the same email.
        await db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    await db.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = str(body.email).lower()
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        verify_password(body.password, _DUMMY_HASH)
        raise _unauthorized("Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise _unauthorized("Invalid email or password")
    return _token_response(user)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(current_user)):
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name)


@router.get("/organizations", response_model=list[OrganizationResponse])
async def organizations(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Organization, Membership.role)
        .join(Membership)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at)
    )
    return [OrganizationResponse(id=org.id, name=org.name, slug=org.slug, role=role) for org, role in result.all()]
