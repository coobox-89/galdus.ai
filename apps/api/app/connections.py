"""Models module: BYOK provider connections, scoped to an organization."""
import uuid
from datetime import datetime, timezone

import litellm
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .crypto import SecretUnavailable, decrypt, encrypt, hint
from .db import get_db
from .identity import current_membership
from .models import Membership, ProviderConnection
from .providers import PROVIDERS, catalog, litellm_model, validate_base_url
from .ratelimit import enforce


async def _audit(db, membership, action, target_id, **kw):
    from .governance import audit
    await audit(db, membership, action, "model_connection", target_id, **kw)

router = APIRouter(prefix="/api/v1/models", tags=["models"])

MANAGER_ROLES = {"owner", "admin"}


def require_manager(membership: Membership) -> None:
    if membership.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Only workspace owners and admins can manage model connections")


class ConnectionCreate(BaseModel):
    provider: str = Field(max_length=40)
    label: str = Field(min_length=1, max_length=80)
    api_key: str | None = Field(default=None, max_length=1000)
    api_base: str | None = Field(default=None, max_length=500)
    default_model: str | None = Field(default=None, max_length=200)


class ConnectionOut(BaseModel):
    id: uuid.UUID
    provider: str
    provider_label: str
    label: str
    api_key_hint: str | None
    api_base: str | None
    default_model: str | None
    created_at: datetime
    last_used_at: datetime | None


class TestRequest(BaseModel):
    model: str = Field(min_length=1, max_length=200)


class KeyCheck(BaseModel):
    provider: str = Field(max_length=40)
    api_key: str | None = Field(default=None, max_length=1000)
    api_base: str | None = Field(default=None, max_length=500)
    model: str = Field(min_length=1, max_length=200)


def to_out(c: ProviderConnection) -> ConnectionOut:
    return ConnectionOut(id=c.id, provider=c.provider, provider_label=PROVIDERS.get(c.provider, {}).get("label", c.provider),
                         label=c.label, api_key_hint=c.api_key_hint, api_base=c.api_base, default_model=c.default_model,
                         created_at=c.created_at, last_used_at=c.last_used_at)


async def get_connection(db: AsyncSession, membership: Membership, connection_id: uuid.UUID) -> ProviderConnection:
    conn = await db.scalar(select(ProviderConnection).where(
        ProviderConnection.id == connection_id, ProviderConnection.organization_id == membership.organization_id))
    if not conn:
        raise HTTPException(status_code=404, detail="Model connection not found in this workspace")
    return conn


def call_kwargs(conn: ProviderConnection, model: str) -> dict:
    """LiteLLM arguments for a call through this connection."""
    kwargs: dict = {"model": litellm_model(conn.provider, model)}
    if conn.api_key_encrypted:
        try:
            kwargs["api_key"] = decrypt(conn.api_key_encrypted)
        except SecretUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    elif conn.provider == "openai_compatible":
        kwargs["api_key"] = "not-needed"
    if conn.api_base:
        kwargs["api_base"] = conn.api_base
    return kwargs


@router.get("/providers")
async def providers(membership: Membership = Depends(current_membership)):
    return catalog()


@router.get("/connections", response_model=list[ConnectionOut])
async def list_connections(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ProviderConnection).where(
        ProviderConnection.organization_id == membership.organization_id).order_by(ProviderConnection.created_at))).scalars().all()
    return [to_out(c) for c in rows]


@router.post("/connections", response_model=ConnectionOut, status_code=201)
async def create_connection(body: ConnectionCreate, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    spec = PROVIDERS.get(body.provider)
    if not spec:
        raise HTTPException(status_code=400, detail="Unknown provider")
    key = (body.api_key or "").strip() or None
    if spec["key"] and not key:
        raise HTTPException(status_code=400, detail="This provider requires an API key")
    base = None
    if spec["base_url"]:
        if not body.api_base:
            raise HTTPException(status_code=400, detail="This provider requires a base URL")
        base = validate_base_url(body.api_base, settings.allow_private_model_endpoints)
    if body.default_model:
        litellm_model(body.provider, body.default_model.strip())
    try:
        encrypted = encrypt(key) if key else None
    except SecretUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    conn = ProviderConnection(
        organization_id=membership.organization_id, provider=body.provider, label=body.label.strip(),
        api_key_encrypted=encrypted, api_key_hint=hint(key) if key else None, api_base=base,
        default_model=(body.default_model or "").strip() or None, created_by=membership.user_id,
    )
    db.add(conn)
    await db.flush()
    await _audit(db, membership, "model_connection.created", conn.id, provider=conn.provider, label=conn.label)
    await db.commit()
    await db.refresh(conn)
    return to_out(conn)


@router.delete("/connections/{connection_id}", status_code=204)
async def delete_connection(connection_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    conn = await get_connection(db, membership, connection_id)
    await db.delete(conn)
    await _audit(db, membership, "model_connection.deleted", connection_id)
    await db.commit()


@router.post("/connections/{connection_id}/test")
async def test_connection(connection_id: uuid.UUID, body: TestRequest, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    enforce(f"model-test:{membership.user_id}", 10)
    conn = await get_connection(db, membership, connection_id)
    kwargs = call_kwargs(conn, body.model.strip())
    try:
        result = await litellm.acompletion(messages=[{"role": "user", "content": "Reply with the single word: ok"}],
                                           max_tokens=5, timeout=30, num_retries=0, **kwargs)
    except Exception as exc:
        return {"ok": False, "error": type(exc).__name__, "message": _safe_message(exc)}
    conn.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "model": getattr(result, "model", None) or kwargs["model"],
            "reply": (result.choices[0].message.content or "").strip()[:100]}


@router.post("/check")
async def check_key(body: KeyCheck, membership: Membership = Depends(current_membership)):
    """Try a key before it is saved, so the connect wizard can tell the user what to fix."""
    require_manager(membership)
    enforce(f"model-test:{membership.user_id}", 10)
    spec = PROVIDERS.get(body.provider)
    if not spec:
        raise HTTPException(status_code=400, detail="Unknown provider")
    key = (body.api_key or "").strip() or None
    if spec["key"] and not key:
        raise HTTPException(status_code=400, detail="This provider requires an API key")
    kwargs: dict = {"model": litellm_model(body.provider, body.model.strip())}
    if key:
        kwargs["api_key"] = key
    elif body.provider == "openai_compatible":
        kwargs["api_key"] = "not-needed"
    if spec["base_url"]:
        if not body.api_base:
            raise HTTPException(status_code=400, detail="This provider requires a base URL")
        kwargs["api_base"] = validate_base_url(body.api_base, settings.allow_private_model_endpoints)
    try:
        result = await litellm.acompletion(messages=[{"role": "user", "content": "Reply with the single word: ok"}],
                                           max_tokens=5, timeout=30, num_retries=0, **kwargs)
    except Exception as exc:
        return {"ok": False, "error": type(exc).__name__, "message": _safe_message(exc)}
    return {"ok": True, "model": getattr(result, "model", None) or kwargs["model"],
            "reply": (result.choices[0].message.content or "").strip()[:100]}


def _safe_message(exc: Exception) -> str:
    """Provider error text helps users fix their own key/model; strip anything key-like."""
    import re
    text = str(exc)[:300]
    return re.sub(r"(sk|key|gsk|xai|AIza)[-_A-Za-z0-9]{8,}", "[redacted]", text)
