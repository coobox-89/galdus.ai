# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Agents module and built-in apps.

An agent is a reusable configuration: instructions, a model (BYOK connection or
platform model) and optionally a knowledge collection for grounded answers with
numbered citations. Apps are built-in agent templates exposed as simple tools.
Every execution is stored as a Run.
"""
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import json

from .chat import call_model, record_usage, resolve_call
from .governance import audit
from .guardrails import UNTRUSTED_NOTE, fence
from .tools import BUILTIN_TOOLS, MAX_TOOL_OUTPUT, fetch_public_text, get_mcp, mcp_call_tool, now_iso, safe_calc, tool_name
from .connections import get_connection, require_manager
from .db import get_db
from .identity import current_membership
from .knowledge import get_collection, retrieve
from .models import Agent, Membership, Organization, Run
from .providers import MODEL_NAME

router = APIRouter(prefix="/api/v1", tags=["agents"])

GROUNDING = (
    "Answer using the numbered sources below when they are relevant. Cite them inline as [1], [2]. "
    "If the sources do not contain the answer, say so clearly before answering from general knowledge.\n\nSources:\n{sources}"
)
MAX_TOOL_ROUNDS = 6

APPS: dict[str, dict] = {
    "document-qa": {
        "name": "Chat with documents",
        "description": "Ask questions about a knowledge collection and get answers with citations.",
        "needs_collection": True,
        "fields": [{"id": "question", "label": "Question", "type": "textarea"}],
        "instructions": "You are a precise research assistant. Answer only what is asked, concisely, in the user's language.",
        "template": "{question}",
    },
    "summarize": {
        "name": "Summarize",
        "description": "Turn a long text into a short summary with key points.",
        "fields": [{"id": "text", "label": "Text to summarize", "type": "textarea"},
                   {"id": "length", "label": "Length", "type": "select", "options": ["short", "medium", "detailed"]}],
        "instructions": "You write faithful summaries. Never add facts that are not in the text. Reply in the language of the text.",
        "template": "Write a {length} summary of the following text: first a one-sentence overview, then the key points as a list.\n\n---\n{text}",
    },
    "rewrite": {
        "name": "Rewrite tone",
        "description": "Rewrite a text in a different tone while keeping its meaning.",
        "fields": [{"id": "text", "label": "Text", "type": "textarea"},
                   {"id": "tone", "label": "Tone", "type": "select", "options": ["professional", "friendly", "concise", "persuasive", "formal"]}],
        "instructions": "You are an expert editor. Keep the meaning, facts and language of the original. Return only the rewritten text.",
        "template": "Rewrite the following text in a {tone} tone.\n\n---\n{text}",
    },
    "email": {
        "name": "Draft an email",
        "description": "Draft a clear email from a few notes.",
        "fields": [{"id": "notes", "label": "What the email should say", "type": "textarea"},
                   {"id": "recipient", "label": "Recipient / context", "type": "text"}],
        "instructions": "You draft clear, polite business emails. Include a subject line. Reply in the language of the notes.",
        "template": "Draft an email to {recipient} based on these notes:\n\n{notes}",
    },
    "ticket-triage": {
        "name": "IT ticket triage",
        "description": "Classify a support ticket, set priority and draft the first reply.",
        "fields": [{"id": "ticket", "label": "Ticket text", "type": "textarea"}],
        "instructions": "You are an ITIL service desk lead. Be practical and specific. Reply in the language of the ticket.",
        "template": ("Triage this ticket. Return: category, impact, urgency, priority (P1-P4 per ITIL), likely cause, "
                     "next diagnostic steps, and a short first reply to the requester.\n\n---\n{ticket}"),
    },
    "contract-review": {
        "name": "Contract review",
        "description": "Spot risky clauses, missing terms and questions to negotiate.",
        "fields": [{"id": "contract", "label": "Contract or clauses", "type": "textarea"},
                   {"id": "side", "label": "We are the", "type": "select", "options": ["supplier", "customer"]}],
        "instructions": ("You review commercial contracts for business risk. You are not a lawyer and say so once at the end. "
                         "Quote clause numbers. Reply in the language of the contract."),
        "template": ("We are the {side}. Review the contract: list the main obligations, risky or unbalanced clauses "
                     "(with why), missing protections (SLA, liability cap, termination, data protection), and questions to negotiate."
                     "\n\n---\n{contract}"),
    },
    "meeting-actions": {
        "name": "Meeting notes to actions",
        "description": "Turn raw meeting notes into decisions, owners and deadlines.",
        "fields": [{"id": "notes", "label": "Meeting notes or transcript", "type": "textarea"}],
        "instructions": "You turn meeting notes into clear minutes. Do not invent owners or dates. Reply in the language of the notes.",
        "template": ("From these notes produce: a 3-line summary, decisions taken, action items as a table (action, owner, due date; "
                     "write 'to define' when missing), and open questions.\n\n---\n{notes}"),
    },
    "translate": {
        "name": "Translate",
        "description": "Translate text while preserving formatting.",
        "fields": [{"id": "text", "label": "Text", "type": "textarea"},
                   {"id": "language", "label": "Target language", "type": "select",
                    "options": ["English", "Italian", "French", "German", "Spanish", "Portuguese", "Chinese", "Japanese"]}],
        "instructions": "You are a professional translator. Preserve formatting, names and numbers. Return only the translation.",
        "template": "Translate the following text into {language}.\n\n---\n{text}",
    },
}


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    instructions: str = Field(min_length=1, max_length=20_000)
    connection_id: uuid.UUID | None = None
    model: str = Field(min_length=1, max_length=200)
    collection_id: uuid.UUID | None = None
    tools: list[str] = Field(default_factory=list, max_length=10)
    mcp_server_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)


class AgentOut(AgentIn):
    id: uuid.UUID
    created_at: datetime


class RunIn(BaseModel):
    input: str = Field(min_length=1, max_length=50_000)


class AppRunIn(BaseModel):
    connection_id: uuid.UUID | None = None
    model: str = Field(min_length=1, max_length=200)
    collection_id: uuid.UUID | None = None
    inputs: dict[str, str]


def agent_out(a: Agent) -> AgentOut:
    return AgentOut(id=a.id, name=a.name, description=a.description, instructions=a.instructions,
                    connection_id=a.connection_id, model=a.model, collection_id=a.collection_id,
                    tools=a.tools or [], mcp_server_ids=a.mcp_server_ids or [], created_at=a.created_at)


def run_out(r: Run) -> dict:
    return {"id": str(r.id), "agent_id": str(r.agent_id) if r.agent_id else None, "app_id": r.app_id, "trigger": r.trigger,
            "status": r.status, "input": r.input, "output": r.output, "error": r.error, "model": r.model, "sources": r.sources,
            "steps": r.steps or [], "automation_id": str(r.automation_id) if r.automation_id else None,
            "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens, "duration_ms": r.duration_ms,
            "created_at": r.created_at.isoformat()}


async def validate_refs(db, membership, body) -> None:
    if not MODEL_NAME.match(body.model.strip()):
        raise HTTPException(status_code=400, detail="Invalid model name")
    if body.connection_id:
        await get_connection(db, membership, body.connection_id)
    if body.collection_id:
        await get_collection(db, membership, body.collection_id)
    for t in getattr(body, "tools", []) or []:
        if t not in BUILTIN_TOOLS:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {t}")
    for sid in getattr(body, "mcp_server_ids", []) or []:
        await get_mcp(db, membership, sid)


async def _run_tool(db, membership, name: str, args: dict, ctx: dict) -> str:
    if name == "current_datetime":
        return now_iso()
    if name == "calculator":
        try:
            return safe_calc(str(args.get("expression", "")))
        except Exception as exc:
            return f"ERROR: {exc}"
    if name == "web_fetch":
        title, text = await fetch_public_text(str(args.get("url", "")))
        return f"{title}\n\n{text}"
    if name == "knowledge_search":
        if not ctx.get("collection_id"):
            return "ERROR: this agent has no knowledge collection"
        hits = await retrieve(db, membership, ctx["collection_id"], str(args.get("query", "")), k=5)
        ctx["sources"].extend(hits)
        return "\n\n".join(f"[{h['title']} part {h['chunk'] + 1}] {h['content']}" for h in hits) or "No matches."
    if name in ctx["mcp"]:
        server, original = ctx["mcp"][name]
        return await mcp_call_tool(server, original, args)
    return f"ERROR: unknown tool {name}"


async def _tool_specs(db, membership, tools: list[str], mcp_ids: list, ctx: dict) -> list[dict]:
    specs = [{"type": "function", "function": {"name": t, "description": BUILTIN_TOOLS[t]["description"],
                                               "parameters": BUILTIN_TOOLS[t]["parameters"]}} for t in tools if t in BUILTIN_TOOLS]
    from .tools import mcp_list_tools
    for i, sid in enumerate(mcp_ids):
        server = await get_mcp(db, membership, uuid.UUID(str(sid)))
        for t in await mcp_list_tools(server):
            if t["name"] not in (server.allowed_tools or []):
                continue
            name = tool_name(i, t["name"])
            ctx["mcp"][name] = (server, t["name"])
            specs.append({"type": "function", "function": {"name": name, "description": f"[{server.name}] {t['description']}",
                                                           "parameters": t["input_schema"]}})
    return specs


async def execute(db: AsyncSession, membership: Membership, *, instructions: str, user_input: str, connection_id, model: str,
                  collection_id=None, agent_id=None, app_id=None, trigger="manual", run_as_user=True,
                  tools: list[str] | None = None, mcp_server_ids: list | None = None, automation_id=None) -> Run:
    """Run instructions + input on a model, optionally grounded on a collection and with tools; persist the Run."""
    started = time.monotonic()
    org_id, user_id = membership.organization_id, membership.user_id
    run = Run(organization_id=org_id, user_id=user_id if run_as_user else None, agent_id=agent_id, app_id=app_id,
              trigger=trigger, status="running", input=user_input[:50_000], sources=[], steps=[], automation_id=automation_id)
    ctx = {"collection_id": collection_id, "sources": [], "mcp": {}}
    steps: list[dict] = []
    flagged: list[str] = []
    total_p = total_c = 0
    label = model
    try:
        org = await db.get(Organization, org_id)
        guard = bool(org and org.guardrails_enabled)
        system = instructions + (f"\n\n{UNTRUSTED_NOTE}" if guard else "")
        if collection_id:
            hits = await retrieve(db, membership, collection_id, user_input, k=5)
            ctx["sources"].extend(hits)
            if hits:
                block, found = fence("\n\n".join(f"[{i + 1}] {h['title']} (part {h['chunk'] + 1}):\n{h['content']}"
                                                  for i, h in enumerate(hits)), guard)
                flagged += found
                system = f"{system}\n\n{GROUNDING.format(sources=block)}"
        label, kwargs = await resolve_call(db, membership, connection_id, model)
        specs = await _tool_specs(db, membership, tools or [], mcp_server_ids or [], ctx)
        messages: list[dict] = [{"role": "system", "content": system}, {"role": "user", "content": user_input}]
        content = ""
        for _ in range(MAX_TOOL_ROUNDS):
            result = await call_model(label, kwargs, messages, **({"tools": specs} if specs else {}))
            p, c = record_usage(db, membership, label, result)
            total_p, total_c = total_p + p, total_c + c
            msg = result.choices[0].message
            calls = getattr(msg, "tool_calls", None) or []
            if not calls:
                content = msg.content or ""
                break
            messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
                {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in calls]})
            for tc in calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                step = {"tool": tc.function.name, "input": args, "started_at": now_iso()}
                try:
                    output = (await _run_tool(db, membership, tc.function.name, args, ctx))[:MAX_TOOL_OUTPUT]
                    step["ok"] = not output.startswith("ERROR")
                except HTTPException as exc:
                    output, step["ok"] = f"ERROR: {exc.detail}", False
                fenced, found = fence(output, guard)
                flagged += found
                step["output"] = output[:500]
                steps.append(step)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": fenced})
        else:
            content = content or "Stopped after the maximum number of tool rounds."
        run.status, run.output = "succeeded", content
    except HTTPException as exc:
        await db.rollback()
        run.status, run.error = "failed", str(exc.detail)[:500]
    run.model, run.prompt_tokens, run.completion_tokens = label, total_p, total_c
    if flagged:
        steps.append({"tool": "guardrail", "ok": True, "output": "Neutralized possible prompt injection: " + "; ".join(sorted(set(flagged)))[:400]})
    run.steps = steps
    run.sources = [{k: s[k] for k in ("title", "document_id", "chunk", "score")} | {"excerpt": s["content"][:300]} for s in ctx["sources"][:10]]
    run.duration_ms = int((time.monotonic() - started) * 1000)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


# ---- Agents ---------------------------------------------------------------

@router.get("/agents", response_model=list[AgentOut])
async def list_agents(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Agent).where(Agent.organization_id == membership.organization_id).order_by(Agent.created_at))).scalars().all()
    return [agent_out(a) for a in rows]


@router.post("/agents", response_model=AgentOut, status_code=201)
async def create_agent(body: AgentIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    await validate_refs(db, membership, body)
    data = body.model_dump()
    data["mcp_server_ids"] = [str(x) for x in data["mcp_server_ids"]]
    agent = Agent(organization_id=membership.organization_id, created_by=membership.user_id, **data)
    agent.model = agent.model.strip()
    db.add(agent)
    await db.flush()
    await audit(db, membership, "agent.created", "agent", agent.id, name=agent.name)
    await db.commit()
    await db.refresh(agent)
    return agent_out(agent)


async def get_agent(db, membership, agent_id) -> Agent:
    agent = await db.scalar(select(Agent).where(Agent.id == agent_id, Agent.organization_id == membership.organization_id))
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found in this workspace")
    return agent


@router.put("/agents/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: uuid.UUID, body: AgentIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    agent = await get_agent(db, membership, agent_id)
    await validate_refs(db, membership, body)
    data = body.model_dump()
    data["mcp_server_ids"] = [str(x) for x in data["mcp_server_ids"]]
    for k, v in data.items():
        setattr(agent, k, v.strip() if isinstance(v, str) and k == "model" else v)
    await audit(db, membership, "agent.updated", "agent", agent.id, name=agent.name)
    await db.commit()
    await db.refresh(agent)
    return agent_out(agent)


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    await db.delete(await get_agent(db, membership, agent_id))
    await audit(db, membership, "agent.deleted", "agent", agent_id)
    await db.commit()


@router.post("/agents/{agent_id}/runs")
async def run_agent(agent_id: uuid.UUID, body: RunIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    agent = await get_agent(db, membership, agent_id)
    run = await execute(db, membership, instructions=agent.instructions, user_input=body.input, connection_id=agent.connection_id,
                        model=agent.model, collection_id=agent.collection_id, agent_id=agent.id,
                        tools=agent.tools, mcp_server_ids=agent.mcp_server_ids)
    return run_out(run)


@router.get("/runs")
async def list_runs(agent_id: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=200),
                    membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    q = select(Run).where(Run.organization_id == membership.organization_id)
    if agent_id:
        q = q.where(Run.agent_id == agent_id)
    rows = (await db.execute(q.order_by(Run.created_at.desc()).limit(limit))).scalars().all()
    return [run_out(r) for r in rows]


# ---- Apps -----------------------------------------------------------------

@router.get("/apps")
async def list_apps(membership: Membership = Depends(current_membership)):
    return [{"id": k, **{f: v[f] for f in ("name", "description", "fields")}, "needs_collection": v.get("needs_collection", False)}
            for k, v in APPS.items()]


@router.post("/apps/{app_id}/runs")
async def run_app(app_id: str, body: AppRunIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    app = APPS.get(app_id)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    await validate_refs(db, membership, body)
    if app.get("needs_collection") and not body.collection_id:
        raise HTTPException(status_code=400, detail="Choose a knowledge collection")
    values = {}
    for field in app["fields"]:
        value = (body.inputs.get(field["id"]) or "").strip()
        if field.get("options") and value not in field["options"]:
            value = field["options"][0]
        if not value and field["type"] == "textarea":
            raise HTTPException(status_code=400, detail=f"{field['label']} is required")
        values[field["id"]] = value[:50_000]
    run = await execute(db, membership, instructions=app["instructions"], user_input=app["template"].format(**values),
                        connection_id=body.connection_id, model=body.model.strip(), collection_id=body.collection_id, app_id=app_id)
    return run_out(run)
