import re
import uuid
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .auth import create_access_token, decode_access_token, hash_password, verify_password
from .db import get_db
from .models import Membership, Organization, User

router = APIRouter(prefix="/api/v1/auth", tags=["identity"])
bearer = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

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
    password: str

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

async def current_user(token: str = Depends(bearer), db: AsyncSession = Depends(get_db)) -> User:
    try:
        user_id = uuid.UUID(decode_access_token(token))
    except (jwt.InvalidTokenError, ValueError, RuntimeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "workspace"
    return f"{base}-{uuid.uuid4().hex[:8]}"

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    email = str(body.email).lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, full_name=body.full_name.strip(), password_hash=hash_password(body.password))
    org = Organization(name=body.organization_name.strip(), slug=make_slug(body.organization_name))
    db.add_all([user, org])
    await db.flush()
    db.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
    await db.commit()
    await db.refresh(user)
    from .config import settings
    return TokenResponse(access_token=create_access_token(str(user.id)), expires_in=settings.jwt_expire_minutes * 60, user=UserResponse(id=user.id, email=user.email, full_name=user.full_name))

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = str(body.email).lower()
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password", headers={"WWW-Authenticate": "Bearer"})
    from .config import settings
    return TokenResponse(access_token=create_access_token(str(user.id)), expires_in=settings.jwt_expire_minutes * 60, user=UserResponse(id=user.id, email=user.email, full_name=user.full_name))

@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(current_user)):
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name)

@router.get("/organizations", response_model=list[OrganizationResponse])
async def organizations(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization, Membership.role).join(Membership).where(Membership.user_id == user.id))
    return [OrganizationResponse(id=org.id, name=org.name, slug=org.slug, role=role) for org, role in result.all()]
