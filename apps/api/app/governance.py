# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Governance: audit log, members and roles, invitations, workspace policies."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .identity import current_membership, current_user
from .models import AuditEvent, Invitation, Membership, Organization, User
from .ratelimit import enforce
from .mailer import send as send_email

router = APIRouter(prefix="/api/v1", tags=["governance"])

ROLES = ("owner", "admin", "member")
INVITE_DAYS = 7


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def audit(db: AsyncSession, membership: Membership | None, action: str, target_type: str = "", target_id="",
                organization_id=None, actor_id=None, **details) -> None:
    """Record a security-relevant action. Caller commits."""
    db.add(AuditEvent(organization_id=organization_id or membership.organization_id,
                      actor_id=actor_id if actor_id is not None else (membership.user_id if membership else None),
                      action=action, target_type=target_type, target_id=str(target_id or ""),
                      details={k: v for k, v in details.items() if v is not None}))


def require_role(membership: Membership, *roles: str) -> None:
    if membership.role not in roles:
        raise HTTPException(status_code=403, detail=f"This action requires the {' or '.join(roles)} role")


# ---- Audit -----------------------------------------------------------------

@router.get("/org/audit")
async def list_audit(limit: int = Query(100, ge=1, le=500), membership: Membership = Depends(current_membership),
                     db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    rows = (await db.execute(
        select(AuditEvent, User.email).outerjoin(User, User.id == AuditEvent.actor_id)
        .where(AuditEvent.organization_id == membership.organization_id)
        .order_by(AuditEvent.created_at.desc()).limit(limit))).all()
    return [{"id": str(e.id), "action": e.action, "target_type": e.target_type, "target_id": e.target_id, "details": e.details,
             "actor": email, "created_at": e.created_at.isoformat()} for e, email in rows]


# ---- Members ---------------------------------------------------------------

class RoleChange(BaseModel):
    role: str = Field(pattern="^(owner|admin|member)$")


@router.get("/org/members")
async def members(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Membership, User).join(User, User.id == Membership.user_id)
                             .where(Membership.organization_id == membership.organization_id)
                             .order_by(Membership.created_at))).all()
    return [{"user_id": str(u.id), "email": u.email, "full_name": u.full_name, "role": m.role,
             "joined_at": m.created_at.isoformat(), "avatar": u.avatar} for m, u in rows]


async def _owner_count(db, org_id) -> int:
    return await db.scalar(select(func.count()).select_from(Membership).where(
        Membership.organization_id == org_id, Membership.role == "owner"))


async def _target(db, membership, user_id) -> Membership:
    target = await db.scalar(select(Membership).where(Membership.organization_id == membership.organization_id,
                                                      Membership.user_id == user_id))
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this workspace")
    return target


@router.patch("/org/members/{user_id}")
async def change_role(user_id: uuid.UUID, body: RoleChange, membership: Membership = Depends(current_membership),
                      db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner")
    target = await _target(db, membership, user_id)
    if target.role == "owner" and body.role != "owner" and await _owner_count(db, membership.organization_id) <= 1:
        raise HTTPException(status_code=400, detail="A workspace needs at least one owner")
    old = target.role
    target.role = body.role
    await audit(db, membership, "member.role_changed", "user", user_id, old=old, new=body.role)
    await db.commit()
    return {"user_id": str(user_id), "role": body.role}


@router.delete("/org/members/{user_id}", status_code=204)
async def remove_member(user_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    if user_id != membership.user_id:
        require_role(membership, "owner", "admin")
    target = await _target(db, membership, user_id)
    if target.role == "owner" and await _owner_count(db, membership.organization_id) <= 1:
        raise HTTPException(status_code=400, detail="A workspace needs at least one owner")
    if target.role == "owner" and membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can remove an owner")
    await db.delete(target)
    await audit(db, membership, "member.removed", "user", user_id)
    await db.commit()


# ---- Invitations -----------------------------------------------------------

class InviteIn(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(admin|member)$")


class AcceptIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


@router.get("/org/invitations")
async def list_invitations(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    rows = (await db.execute(select(Invitation).where(Invitation.organization_id == membership.organization_id,
                                                      Invitation.accepted_at.is_(None))
                             .order_by(Invitation.created_at.desc()))).scalars().all()
    now = datetime.now(timezone.utc)
    return [{"id": str(i.id), "email": i.email, "role": i.role, "expires_at": i.expires_at.isoformat(),
             "expired": i.expires_at < now} for i in rows]


@router.post("/org/invitations", status_code=201)
async def invite(body: InviteIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    await enforce(f"invite:{membership.user_id}", 20)
    token = secrets.token_urlsafe(32)
    inv = Invitation(organization_id=membership.organization_id, email=str(body.email).lower(), role=body.role,
                     token_hash=token_hash(token), invited_by=membership.user_id,
                     expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_DAYS))
    db.add(inv)
    await db.flush()
    await audit(db, membership, "invitation.created", "invitation", inv.id, email=inv.email, role=inv.role)
    await db.commit()
    org = await db.get(Organization, membership.organization_id)
    from .config import settings
    link = f"{settings.frontend_url.rstrip('/')}/#/account?invite={token}"
    emailed = await send_email(inv.email, f"You are invited to {org.name} on Galdus.ai", f"Join {org.name}",
                               f"You have been invited to the {org.name} workspace on Galdus.ai as {inv.role}. Sign in or create an account with this address, then accept. The invitation is valid for {INVITE_DAYS} days.",
                               "Accept invitation", link, "If you were not expecting this invitation you can ignore this email.")
    # The token is also returned once, so the inviter can share the link when email is not configured.
    return {"id": str(inv.id), "email": inv.email, "role": inv.role, "token": token, "emailed": emailed,
            "expires_at": inv.expires_at.isoformat()}


@router.delete("/org/invitations/{invitation_id}", status_code=204)
async def revoke_invitation(invitation_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    inv = await db.scalar(select(Invitation).where(Invitation.id == invitation_id, Invitation.organization_id == membership.organization_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    await db.delete(inv)
    await audit(db, membership, "invitation.revoked", "invitation", invitation_id)
    await db.commit()


@router.post("/invitations/accept")
async def accept_invitation(body: AcceptIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await enforce(f"accept:{user.id}", 10)
    inv = await db.scalar(select(Invitation).where(Invitation.token_hash == token_hash(body.token)))
    if not inv or inv.accepted_at or inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This invitation is invalid or has expired")
    if inv.email != user.email.lower():
        raise HTTPException(status_code=403, detail="This invitation was sent to a different email address")
    existing = await db.scalar(select(Membership).where(Membership.organization_id == inv.organization_id, Membership.user_id == user.id))
    if not existing:
        db.add(Membership(user_id=user.id, organization_id=inv.organization_id, role=inv.role))
    inv.accepted_at = datetime.now(timezone.utc)
    await audit(db, None, "invitation.accepted", "invitation", inv.id, organization_id=inv.organization_id, actor_id=user.id)
    await db.commit()
    org = await db.get(Organization, inv.organization_id)
    return {"organization_id": str(org.id), "name": org.name, "role": inv.role}


# ---- Workspace policies ----------------------------------------------------

class SettingsIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    monthly_token_limit: int = Field(ge=0, le=10_000_000_000)
    guardrails_enabled: bool


@router.get("/org/settings")
async def get_settings(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, membership.organization_id)
    since = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    from .models import UsageEvent
    used = await db.scalar(select(func.coalesce(func.sum(UsageEvent.prompt_tokens + UsageEvent.completion_tokens), 0))
                           .where(UsageEvent.organization_id == org.id, UsageEvent.created_at >= since))
    return {"id": str(org.id), "name": org.name, "monthly_token_limit": org.monthly_token_limit,
            "guardrails_enabled": org.guardrails_enabled, "tokens_this_month": int(used or 0), "role": membership.role}


@router.put("/org/settings")
async def update_settings(body: SettingsIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner")
    org = await db.get(Organization, membership.organization_id)
    org.name, org.monthly_token_limit, org.guardrails_enabled = body.name.strip(), body.monthly_token_limit, body.guardrails_enabled
    await audit(db, membership, "workspace.settings_updated", "organization", org.id,
                monthly_token_limit=body.monthly_token_limit, guardrails_enabled=body.guardrails_enabled)
    await db.commit()
    return await get_settings(membership, db)
