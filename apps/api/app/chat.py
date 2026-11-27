import logging
from datetime import datetime, timedelta, timezone

import litellm
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_db
from .identity import current_membership
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
    return ModelsResponse(default=settings.litellm_model, models=settings.allowed_model_list)


@router.post("/chat/completions", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    membership: Membership = Depends(current_membership),
    db: AsyncSession = Depends(get_db),
):
    enforce(f"chat:{membership.user_id}", settings.rate_limit_chat_per_minute)
    model = resolve_model(body.model)
    kwargs = provider_kwargs(model)

    if settings.daily_token_budget_per_user > 0:
        if await tokens_used_today(db, membership.user_id) >= settings.daily_token_budget_per_user:
            raise HTTPException(status_code=429, detail="Daily usage limit reached. Try again tomorrow.")

    try:
        result = await litellm.acompletion(
            model=model,
            messages=[m.model_dump() for m in body.messages],
            timeout=settings.llm_timeout_seconds,
            num_retries=settings.llm_max_retries,
            max_tokens=settings.llm_max_output_tokens,
            **kwargs,
        )
    except Exception as exc:  # provider errors must not leak details or keys
        logger.warning("Model provider call failed: model=%s error=%s", model, type(exc).__name__)
        raise HTTPException(status_code=502, detail="The model provider request failed. Please try again.") from exc

    usage = getattr(result, "usage", None)
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    db.add(UsageEvent(
        user_id=membership.user_id,
        organization_id=membership.organization_id,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    ))
    await db.commit()

    return ChatResponse(
        model=getattr(result, "model", None) or model,
        content=result.choices[0].message.content or "",
        usage=Usage(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens),
    )
