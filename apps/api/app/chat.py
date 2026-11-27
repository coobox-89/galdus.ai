import logging
from datetime import datetime, timedelta, timezone

import litellm
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_db
from .identity import current_membership
from .connections import call_kwargs, get_connection
from .models import Membership, UsageEvent
from .ratelimit import enforce
from .schemas import ChatRequest, ChatResponse, ModelsResponse, Usage

logger = logging.getLogger("galdus.chat")
router = APIRouter(prefix="/api/v1", tags=["chat"])


def resolve_model(requested: str | None) -> str:
    """Only server-allowlisted model identifiers may reach LiteLLM."""
    model = requested or settings.litellm_model
    if model not in settings.allowed_model_list:
        raise HTTPException(status_code=400, detail="This model is not enabled on this server")
    return model


def provider_kwargs(model: str) -> dict:
    kwargs: dict = {}
    if model.startswith("ollama/") or model.startswith("ollama_chat/"):
        if settings.ollama_api_base:
            kwargs["api_base"] = settings.ollama_api_base
        return kwargs
    if settings.openai_api_key and (model.startswith("openai/") or "/" not in model):
        kwargs["api_key"] = settings.openai_api_key
        return kwargs
    # Other providers: LiteLLM reads their standard env vars (ANTHROPIC_API_KEY, ...).
    env = litellm.validate_environment(model=model)
    if not env.get("keys_in_environment"):
        raise HTTPException(status_code=503, detail="The model provider is not configured on this server")
    return kwargs


async def tokens_used_today(db: AsyncSession, user_id) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=1)
    total = await db.scalar(
        select(func.coalesce(func.sum(UsageEvent.prompt_tokens + UsageEvent.completion_tokens), 0))
        .where(UsageEvent.user_id == user_id, UsageEvent.created_at >= since)
    )
    return int(total or 0)


@router.get("/models", response_model=ModelsResponse)
async def list_models(membership: Membership = Depends(current_membership)):
    """Platform-provided models (may be empty when the platform is BYOK-only)."""
    models = settings.allowed_model_list if platform_models_enabled() else []
    return ModelsResponse(default=settings.litellm_model if models else "", models=models)


def platform_models_enabled() -> bool:
    return bool(settings.openai_api_key or _split(settings.allowed_models))


def _split(v: str) -> list[str]:
    return [x for x in (i.strip() for i in v.split(",")) if x]


async def resolve_call(db: AsyncSession, membership: Membership, connection_id=None, model: str | None = None) -> tuple[str, dict]:
    """Pick credentials and enforce limits for a model call. Returns (label, litellm kwargs)."""
    await enforce(f"chat:{membership.user_id}", settings.rate_limit_chat_per_minute)
    await enforce_workspace_limit(db, membership)
    if connection_id:
        conn = await get_connection(db, membership, connection_id)
        chosen = (model or conn.default_model or "").strip()
        if not chosen:
            raise HTTPException(status_code=400, detail="Choose a model for this connection")
        kwargs = call_kwargs(conn, chosen)
        conn.last_used_at = datetime.now(timezone.utc)
        return kwargs["model"], kwargs
    label = resolve_model(model)
    if settings.daily_token_budget_per_user > 0:
        if await tokens_used_today(db, membership.user_id) >= settings.daily_token_budget_per_user:
            raise HTTPException(status_code=429, detail="Daily usage limit reached. Try again tomorrow.")
    return label, {"model": label, **provider_kwargs(label)}


async def enforce_workspace_limit(db: AsyncSession, membership: Membership) -> None:
    from .models import Organization
    org = await db.get(Organization, membership.organization_id)
    if not org or not org.monthly_token_limit:
        return
    since = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = await db.scalar(select(func.coalesce(func.sum(UsageEvent.prompt_tokens + UsageEvent.completion_tokens), 0))
                           .where(UsageEvent.organization_id == org.id, UsageEvent.created_at >= since))
    if int(used or 0) >= org.monthly_token_limit:
        raise HTTPException(status_code=429, detail="This workspace reached its monthly token limit. An owner can raise it in Team settings.")


async def call_model(label: str, kwargs: dict, messages: list[dict], **extra):
    try:
        return await litellm.acompletion(messages=messages, timeout=settings.llm_timeout_seconds,
                                         num_retries=settings.llm_max_retries, max_tokens=settings.llm_max_output_tokens,
                                         **kwargs, **extra)
    except HTTPException:
        raise
    except Exception as exc:  # provider errors must not leak details or keys
        logger.warning("Model provider call failed: model=%s error=%s", label, type(exc).__name__)
        raise HTTPException(status_code=502, detail=f"The model provider request failed ({type(exc).__name__}). Check the model name and key.") from exc


def record_usage(db: AsyncSession, membership: Membership, label: str, result) -> tuple[int, int]:
    usage = getattr(result, "usage", None)
    p = int(getattr(usage, "prompt_tokens", 0) or 0)
    c = int(getattr(usage, "completion_tokens", 0) or 0)
    db.add(UsageEvent(user_id=membership.user_id, organization_id=membership.organization_id, model=label[:200],
                      prompt_tokens=p, completion_tokens=c))
    return p, c


async def complete(
    db: AsyncSession,
    membership: Membership,
    messages: list[dict],
    connection_id=None,
    model: str | None = None,
) -> tuple[str, str, int, int]:
    """Run one completion for a member. Returns (model_label, content, prompt_tokens, completion_tokens)."""
    label, kwargs = await resolve_call(db, membership, connection_id, model)
    result = await call_model(label, kwargs, messages)
    p, c = record_usage(db, membership, label, result)
    await db.commit()
    return label, result.choices[0].message.content or "", p, c


@router.post("/chat/completions", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    membership: Membership = Depends(current_membership),
    db: AsyncSession = Depends(get_db),
):
    label, content, p, c = await complete(db, membership, [m.model_dump() for m in body.messages],
                                          connection_id=body.connection_id, model=body.model)
    return ChatResponse(model=label, content=content, usage=Usage(prompt_tokens=p, completion_tokens=c))
