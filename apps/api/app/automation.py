# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Automation: run agents on a schedule (cron) or from an incoming webhook, and
optionally deliver results to an outgoing webhook (Slack, Teams, n8n, Make, Zapier...).

A scheduler outside the API (GitHub Actions cron, Render cron, or any external
pinger) calls POST /api/v1/automation/tick with the AUTOMATION_TOKEN secret.
"""
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timezone

import httpx
from croniter import croniter
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .agents import execute, get_agent, run_out
from .config import settings
from .crypto import SecretUnavailable, decrypt, encrypt
from .db import get_db
from .governance import audit, require_role
from .identity import current_membership
from .models import Agent, Automation, Membership, Run
from .providers import validate_base_url
from .ratelimit import client_ip, enforce

router = APIRouter(prefix="/api/v1", tags=["automation"])

MAX_PER_TICK = 10
DISABLE_AFTER_FAILURES = 5


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def next_run(cron: str, after: datetime | None = None) -> datetime:
    return croniter(cron, after or datetime.now(timezone.utc)).get_next(datetime)


def validate_cron(cron: str) -> str:
    cron = " ".join(cron.split())
    if not croniter.is_valid(cron) or len(cron.split()) != 5:
        raise HTTPException(status_code=400, detail="Schedule must be a 5-field cron expression, e.g. '0 8 * * 1-5'")
    it = croniter(cron, datetime.now(timezone.utc))
    a, b = it.get_next(datetime), it.get_next(datetime)
    if (b - a).total_seconds() < 15 * 60:
        raise HTTPException(status_code=400, detail="Schedules can run at most every 15 minutes")
    return cron


class AutomationIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    agent_id: uuid.UUID
    input: str = Field(min_length=1, max_length=20_000)
    cron: str | None = Field(default=None, max_length=100)
    webhook: bool = False
    deliver_url: str | None = Field(default=None, max_length=1000)
    enabled: bool = True


def out(a: Automation, agent_name: str | None = None, webhook_token: str | None = None) -> dict:
    d = {"id": str(a.id), "name": a.name, "agent_id": str(a.agent_id), "agent_name": agent_name, "input": a.input, "cron": a.cron,
         "webhook": bool(a.webhook_token_hash), "delivers": bool(a.deliver_url_encrypted), "enabled": a.enabled,
         "next_run_at": a.next_run_at.isoformat() if a.next_run_at else None,
         "last_run_at": a.last_run_at.isoformat() if a.last_run_at else None, "last_status": a.last_status,
         "consecutive_failures": a.consecutive_failures, "created_at": a.created_at.isoformat()}
    if webhook_token:
        d["webhook_path"] = f"/api/v1/hooks/{webhook_token}"
    return d


async def get_automation(db, membership, automation_id) -> Automation:
    a = await db.scalar(select(Automation).where(Automation.id == automation_id, Automation.organization_id == membership.organization_id))
    if not a:
        raise HTTPException(status_code=404, detail="Automation not found in this workspace")
    return a


@router.get("/automations")
async def list_automations(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Automation, Agent.name).join(Agent, Agent.id == Automation.agent_id)
                             .where(Automation.organization_id == membership.organization_id).order_by(Automation.created_at))).all()
    return [out(a, n) for a, n in rows]


@router.post("/automations", status_code=201)
async def create_automation(body: AutomationIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    agent = await get_agent(db, membership, body.agent_id)
    if not body.cron and not body.webhook:
        raise HTTPException(status_code=400, detail="Choose a schedule, a webhook trigger, or both")
    cron = validate_cron(body.cron) if body.cron else None
    deliver = None
    if body.deliver_url:
        try:
            deliver = encrypt(validate_base_url(body.deliver_url, allow_private=False))
        except SecretUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    token = secrets.token_urlsafe(32) if body.webhook else None
    a = Automation(organization_id=membership.organization_id, name=body.name.strip(), agent_id=agent.id, input=body.input,
                   cron=cron, webhook_token_hash=_hash(token) if token else None, deliver_url_encrypted=deliver,
                   enabled=body.enabled, next_run_at=next_run(cron) if cron and body.enabled else None,
                   consecutive_failures=0, created_by=membership.user_id)
    db.add(a)
    await db.flush()
    await audit(db, membership, "automation.created", "automation", a.id, cron=cron, webhook=bool(token))
    await db.commit()
    return out(a, agent.name, token)


class ToggleIn(BaseModel):
    enabled: bool


@router.patch("/automations/{automation_id}")
async def toggle(automation_id: uuid.UUID, body: ToggleIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    a = await get_automation(db, membership, automation_id)
    a.enabled = body.enabled
    a.consecutive_failures = 0 if body.enabled else a.consecutive_failures
    a.next_run_at = next_run(a.cron) if a.cron and body.enabled else None
    await audit(db, membership, "automation.enabled" if body.enabled else "automation.disabled", "automation", a.id)
    await db.commit()
    return out(a)


@router.delete("/automations/{automation_id}", status_code=204)
async def delete_automation(automation_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    a = await get_automation(db, membership, automation_id)
    await db.delete(a)
    await audit(db, membership, "automation.deleted", "automation", automation_id)
    await db.commit()


@router.post("/automations/{automation_id}/run")
async def run_now(automation_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    """Run an automation once, now, to check it works (does not change its schedule)."""
    require_role(membership, "owner", "admin")
    await enforce(f"run-now:{membership.user_id}", 10)
    a = await db.scalar(select(Automation).where(Automation.id == automation_id, Automation.organization_id == membership.organization_id))
    if not a:
        raise HTTPException(status_code=404, detail="Automation not found in this workspace")
    if not a.enabled:
        raise HTTPException(status_code=409, detail="Resume the automation to run it")
    run = await run_automation(db, a, "manual")
    if not run:
        raise HTTPException(status_code=409, detail="The automation could not run: its agent or owner no longer exists")
    return {"run_id": str(run.id), "status": run.status, "output": run.output, "error": run.error}


@router.get("/automations/{automation_id}/runs")
async def automation_runs(automation_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    await get_automation(db, membership, automation_id)
    rows = (await db.execute(select(Run).where(Run.automation_id == automation_id).order_by(Run.created_at.desc()).limit(20))).scalars().all()
    return [run_out(r) for r in rows]


async def deliver(a: Automation, run: Run) -> None:
    if not a.deliver_url_encrypted or run.status != "succeeded":
        return
    try:
        url = validate_base_url(decrypt(a.deliver_url_encrypted), allow_private=False)
        text = f"*{a.name}*\n\n{run.output[:3500]}"
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            await client.post(url, json={"text": text, "automation": a.name, "run_id": str(run.id), "output": run.output})
    except Exception:  # delivery is best effort; the run is already stored
        pass


async def run_automation(db: AsyncSession, a: Automation, trigger: str, user_input: str | None = None) -> Run | None:
    membership = await db.scalar(select(Membership).where(Membership.organization_id == a.organization_id,
                                                          Membership.user_id == a.created_by))
    agent = await db.get(Agent, a.agent_id)
    if not membership or not agent:
        a.enabled, a.last_status = False, "disabled"
        await db.commit()
        return None
    text = a.input if user_input is None else f"{a.input}\n\n<input>\n{user_input[:20_000]}\n</input>"
    run = await execute(db, membership, instructions=agent.instructions, user_input=text, connection_id=agent.connection_id,
                        model=agent.model, collection_id=agent.collection_id, agent_id=agent.id, trigger=trigger,
                        tools=agent.tools, mcp_server_ids=agent.mcp_server_ids, automation_id=a.id)
    a = await db.get(Automation, a.id)
    a.last_run_at, a.last_status = datetime.now(timezone.utc), run.status
    a.consecutive_failures = 0 if run.status == "succeeded" else a.consecutive_failures + 1
    if a.consecutive_failures >= DISABLE_AFTER_FAILURES:
        a.enabled = False
    if a.cron and a.enabled:
        a.next_run_at = next_run(a.cron)
    await db.commit()
    await deliver(a, run)
    return run


async def prune_retention(db: AsyncSession) -> None:
    """Retention promised in the privacy policy: usage and audit records 24 months, expired one-time links."""
    from sqlalchemy import text
    for sql in ("delete from usage_events where created_at < now() - interval '24 months'",
                "delete from audit_events where created_at < now() - interval '24 months'",
                "delete from email_verifications where expires_at < now() - interval '7 days'",
                "delete from password_resets where expires_at < now() - interval '7 days'"):
        await db.execute(text(sql))


@router.post("/automation/tick")
async def tick(db: AsyncSession = Depends(get_db), authorization: str | None = Header(default=None)):
    expected = settings.automation_token
    if not expected or not authorization or not hmac.compare_digest(authorization, f"Bearer {expected}"):
        raise HTTPException(status_code=401, detail="Invalid automation token")
    now = datetime.now(timezone.utc)
    due = (await db.execute(select(Automation).where(Automation.enabled.is_(True), Automation.next_run_at.is_not(None),
                                                     Automation.next_run_at <= now)
                            .order_by(Automation.next_run_at).limit(MAX_PER_TICK).with_for_update(skip_locked=True))).scalars().all()
    for a in due:  # claim first so a concurrent tick cannot double-run
        a.next_run_at = next_run(a.cron, now)
    await db.commit()
    results = []
    for a in due:
        run = await run_automation(db, a, "schedule")
        results.append({"automation_id": str(a.id), "status": run.status if run else "skipped"})
    synced = await sync_external_documents(db)
    from .ratelimit import prune_shared
    await prune_shared(db)
    await prune_retention(db)
    await db.commit()
    return {"ran": len(results), "results": results, "documents_synced": synced}


async def sync_external_documents(db: AsyncSession, limit: int = 10) -> int:
    """Refresh documents imported from Google Drive / SharePoint at most once a day."""
    from datetime import timedelta
    from .connectors import resync_document
    from .models import KnowledgeDocument
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    docs = (await db.execute(select(KnowledgeDocument).where(KnowledgeDocument.external_ref.is_not(None),
                                                             KnowledgeDocument.external_connection_id.is_not(None),
                                                             (KnowledgeDocument.synced_at.is_(None)) | (KnowledgeDocument.synced_at < cutoff))
                             .limit(limit))).scalars().all()
    updated = 0
    for doc in docs:
        owner = await db.scalar(select(Membership).where(Membership.organization_id == doc.organization_id, Membership.role == "owner"))
        if not owner:
            continue
        try:
            updated += int(await resync_document(db, owner, doc))
        except HTTPException:
            await db.rollback()
            doc = await db.get(KnowledgeDocument, doc.id)
            if doc:
                doc.synced_at = datetime.now(timezone.utc)
                await db.commit()
    return updated


class HookIn(BaseModel):
    input: str | None = Field(default=None, max_length=20_000)


@router.post("/hooks/{token}")
async def webhook(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    await enforce(f"hook:{client_ip(request)}", 30)
    if len(token) < 20 or len(token) > 100:
        raise HTTPException(status_code=404, detail="Not found")
    a = await db.scalar(select(Automation).where(Automation.webhook_token_hash == _hash(token)))
    if not a or not a.enabled:
        raise HTTPException(status_code=404, detail="Not found")
    # Each automation runs a model call: cap it whatever the caller's IP.
    await enforce(f"hook-automation:{a.id}", 10)
    raw = await request.body()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except ValueError:
        raise HTTPException(status_code=400, detail="The body must be JSON, for example {\"input\": \"...\"}")
    from pydantic import ValidationError
    try:
        body = HookIn.model_validate(payload if isinstance(payload, dict) else {})
    except ValidationError:
        raise HTTPException(status_code=422, detail="input must be a string of at most 20,000 characters")
    run = await run_automation(db, a, "webhook", body.input or "")
    if not run:
        raise HTTPException(status_code=409, detail="Automation is disabled")
    return {"run_id": str(run.id), "status": run.status, "output": run.output, "error": run.error}
