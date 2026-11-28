# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Platform administration console API (read-mostly).

Access requires users.is_platform_admin. Responses never include password hashes
or message content.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_db
from .identity import require_platform_admin
from .models import Membership, Organization, UsageEvent, User

router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_platform_admin)])


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


TOKENS = func.coalesce(func.sum(UsageEvent.prompt_tokens + UsageEvent.completion_tokens), 0)


@router.get("/setup")
async def setup():
    """What the operator has configured. Names and redirect addresses only, never secret values."""
    from .mailer import email_enabled
    from .oauth import configured, redirect_uri
    api = settings.public_api_url.rstrip("/")
    return {
        "public_api_url": api, "frontend_url": settings.frontend_url.rstrip("/"),
        "items": [
            {"id": "encryption", "enabled": len(settings.encryption_key) >= 32, "env": ["ENCRYPTION_KEY"]},
            {"id": "admins", "enabled": bool(settings.admin_email_list), "env": ["ADMIN_EMAILS"]},
            {"id": "google", "enabled": configured("google"), "env": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
             "redirect_uris": [redirect_uri("google", "login"), redirect_uri("google", "connect")]},
            {"id": "github", "enabled": configured("github"), "env": ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
             "redirect_uris": [redirect_uri("github", "login")]},
            {"id": "microsoft", "enabled": configured("microsoft"), "env": ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT"],
             "redirect_uris": [redirect_uri("microsoft", "login"), redirect_uri("microsoft", "connect")]},
            {"id": "email", "enabled": email_enabled(), "env": ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]},
            {"id": "scheduler", "enabled": bool(settings.automation_token), "env": ["AUTOMATION_TOKEN"], "github_secret": "GALDUS_AUTOMATION_TOKEN"},
        ],
    }


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    day = _since(1)
    return {
        "users": await db.scalar(select(func.count()).select_from(User)),
        "organizations": await db.scalar(select(func.count()).select_from(Organization)),
        "new_users_7d": await db.scalar(select(func.count()).select_from(User).where(User.created_at >= _since(7))),
        "requests_24h": await db.scalar(select(func.count()).select_from(UsageEvent).where(UsageEvent.created_at >= day)),
        "tokens_24h": int(await db.scalar(select(TOKENS).where(UsageEvent.created_at >= day)) or 0),
        "tokens_total": int(await db.scalar(select(TOKENS)) or 0),
        "config": {
            "environment": settings.environment,
            "default_model": settings.litellm_model,
            "allowed_models": settings.allowed_model_list,
            "daily_token_budget_per_user": settings.daily_token_budget_per_user,
            "rate_limit_auth_per_minute": settings.rate_limit_auth_per_minute,
            "rate_limit_chat_per_minute": settings.rate_limit_chat_per_minute,
        },
    }


@router.get("/users")
async def users(limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    orgs = select(Membership.user_id, func.count().label("n")).group_by(Membership.user_id).subquery()
    usage = (
        select(UsageEvent.user_id, TOKENS.label("tokens"), func.max(UsageEvent.created_at).label("last"))
        .where(UsageEvent.created_at >= _since(1)).group_by(UsageEvent.user_id).subquery()
    )
    rows = (await db.execute(
        select(User, orgs.c.n, usage.c.tokens, usage.c.last)
        .outerjoin(orgs, orgs.c.user_id == User.id)
        .outerjoin(usage, usage.c.user_id == User.id)
        .order_by(User.created_at.desc()).limit(limit)
    )).all()
    return [
        {"id": str(u.id), "email": u.email, "full_name": u.full_name, "is_platform_admin": bool(u.is_platform_admin),
         "created_at": u.created_at.isoformat(), "organizations": int(n or 0), "tokens_24h": int(t or 0),
         "last_request_at": last.isoformat() if last else None}
        for u, n, t, last in rows
    ]


@router.get("/organizations")
async def organizations(limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    members = select(Membership.organization_id, func.count().label("n")).group_by(Membership.organization_id).subquery()
    usage = select(UsageEvent.organization_id, TOKENS.label("tokens")).group_by(UsageEvent.organization_id).subquery()
    rows = (await db.execute(
        select(Organization, members.c.n, usage.c.tokens)
        .outerjoin(members, members.c.organization_id == Organization.id)
        .outerjoin(usage, usage.c.organization_id == Organization.id)
        .order_by(Organization.created_at.desc()).limit(limit)
    )).all()
    return [
        {"id": str(o.id), "name": o.name, "slug": o.slug, "created_at": o.created_at.isoformat(),
         "members": int(n or 0), "tokens_total": int(t or 0)}
        for o, n, t in rows
    ]


@router.get("/usage")
async def usage(days: int = Query(14, ge=1, le=90), db: AsyncSession = Depends(get_db)):
    day = cast(UsageEvent.created_at, Date)
    rows = (await db.execute(
        select(day.label("day"), UsageEvent.model, func.count().label("requests"), TOKENS.label("tokens"))
        .where(UsageEvent.created_at >= _since(days))
        .group_by(day, UsageEvent.model).order_by(day)
    )).all()
    return [{"day": d.isoformat(), "model": m, "requests": int(r), "tokens": int(t)} for d, m, r, t in rows]


class AdminFlag(BaseModel):
    is_platform_admin: bool


@router.post("/users/{user_id}/admin")
async def set_admin(user_id: uuid.UUID, body: AdminFlag, actor: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)):
    if user_id == actor.id and not body.is_platform_admin:
        raise HTTPException(status_code=400, detail="You cannot remove your own administrator access")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_platform_admin = body.is_platform_admin
    await db.commit()
    return {"id": str(user.id), "is_platform_admin": user.is_platform_admin}
