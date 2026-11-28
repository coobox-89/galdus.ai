# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Agent tools: built-in tools and remote MCP servers (Streamable HTTP).

MCP servers are registered per workspace with an allowlist of tool names; agents
can only call allowlisted tools of servers in their own workspace. All network
destinations are SSRF-checked and every call has a timeout and output cap.
"""
import ast
import asyncio
import json
import operator
import re
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .crypto import SecretUnavailable, decrypt, encrypt
from .db import get_db
from .governance import audit, require_role
from .identity import current_membership
from .models import McpServer, Membership
from .providers import validate_base_url
from .version import VERSION

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])

TOOL_TIMEOUT = 30
MAX_TOOL_OUTPUT = 8000
MAX_FETCH_BYTES = 300_000

BUILTIN_TOOLS = {
    "current_datetime": {
        "description": "Get the current date and time in UTC (ISO 8601).",
        "parameters": {"type": "object", "properties": {}},
    },
    "calculator": {
        "description": "Evaluate an arithmetic expression with + - * / ** % and parentheses.",
        "parameters": {"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]},
    },
    "web_fetch": {
        "description": "Fetch the readable text of a public https web page.",
        "parameters": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
    },
    "knowledge_search": {
        "description": "Search the agent's knowledge collection and return relevant passages.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    },
}

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.Mod: operator.mod, ast.USub: operator.neg, ast.UAdd: operator.pos}


def safe_calc(expr: str) -> str:
    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            left, right = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 100:
                raise ValueError("exponent too large")
            return _OPS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        raise ValueError("unsupported expression")
    if len(expr) > 200:
        raise ValueError("expression too long")
    return str(ev(ast.parse(expr, mode="eval")))


def html_to_text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr)>", "\n", html)
    text = re.sub(r"<[^>]+>", " ", html)
    import html as h
    text = h.unescape(text)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n\n", text)).strip()


async def fetch_public_text(url: str) -> tuple[str, str]:
    """Fetch a public https URL (SSRF-checked on every redirect). Returns (title, text)."""
    for _ in range(4):
        validate_base_url(url, allow_private=False)
        async with httpx.AsyncClient(timeout=20, follow_redirects=False, headers={"User-Agent": f"Galdus.ai/{VERSION} (+https://github.com/coobox-89/galdus.ai)"}) as client:
            async with client.stream("GET", url) as resp:
                if resp.is_redirect and resp.headers.get("location"):
                    url = str(resp.url.join(resp.headers["location"]))
                    continue
                if resp.status_code >= 400:
                    raise HTTPException(status_code=400, detail=f"The page returned HTTP {resp.status_code}")
                body = b""
                async for chunk in resp.aiter_bytes():
                    body += chunk
                    if len(body) > MAX_FETCH_BYTES:
                        break
                ctype = resp.headers.get("content-type", "")
        raw = body.decode("utf-8", errors="replace")
        title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw)
        title = re.sub(r"\s+", " ", title_match.group(1)).strip()[:300] if title_match else url
        return title, html_to_text(raw) if "html" in ctype or "<html" in raw[:500].lower() else raw
    raise HTTPException(status_code=400, detail="Too many redirects")


# ---- MCP client ---------------------------------------------------------------

def _headers(server: McpServer) -> dict:
    if not server.auth_header_encrypted:
        return {}
    try:
        value = decrypt(server.auth_header_encrypted)
    except SecretUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"Authorization": value}


async def _with_session(server: McpServer, fn):
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    from mcp.shared._httpx_utils import create_mcp_http_client
    validate_base_url(server.url, settings.allow_private_model_endpoints)

    async def run():
        async with create_mcp_http_client(headers=_headers(server)) as http:
            async with streamable_http_client(server.url, http_client=http) as streams:
                read, write = streams[0], streams[1]
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    return await fn(session)
    try:
        return await asyncio.wait_for(run(), timeout=TOOL_TIMEOUT)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"MCP server error ({type(exc).__name__})") from exc


async def mcp_list_tools(server: McpServer) -> list[dict]:
    async def fn(session):
        result = await session.list_tools()
        return [{"name": t.name, "description": (t.description or "")[:500], "input_schema": getattr(t, "input_schema", None) or getattr(t, "inputSchema", None) or {"type": "object"}}
                for t in result.tools]
    return await _with_session(server, fn)


async def mcp_call_tool(server: McpServer, name: str, args: dict) -> str:
    if name not in (server.allowed_tools or []):
        raise HTTPException(status_code=403, detail="Tool not allowed")

    async def fn(session):
        result = await session.call_tool(name, args)
        parts = [getattr(c, "text", None) or json.dumps(getattr(c, "model_dump", lambda: str(c))(), default=str)
                 for c in (result.content or [])]
        text = "\n".join(parts)
        failed = getattr(result, "is_error", None) or getattr(result, "isError", False)
        return ("ERROR: " + text) if failed else text
    return await _with_session(server, fn)


# ---- MCP server registry ---------------------------------------------------

class McpIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=8, max_length=500)
    authorization: str | None = Field(default=None, max_length=2000)


class AllowIn(BaseModel):
    allowed_tools: list[str] = Field(max_length=200)


def mcp_out(s: McpServer) -> dict:
    return {"id": str(s.id), "name": s.name, "url": s.url, "has_auth": bool(s.auth_header_encrypted),
            "allowed_tools": s.allowed_tools or [], "created_at": s.created_at.isoformat()}


async def get_mcp(db, membership, server_id) -> McpServer:
    s = await db.scalar(select(McpServer).where(McpServer.id == server_id, McpServer.organization_id == membership.organization_id))
    if not s:
        raise HTTPException(status_code=404, detail="MCP server not found in this workspace")
    return s


@router.get("/builtin-tools")
async def builtin_tools(membership: Membership = Depends(current_membership)):
    return [{"id": k, "description": v["description"]} for k, v in BUILTIN_TOOLS.items()]


@router.get("/mcp")
async def list_mcp(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(McpServer).where(McpServer.organization_id == membership.organization_id)
                             .order_by(McpServer.created_at))).scalars().all()
    return [mcp_out(s) for s in rows]


@router.post("/mcp", status_code=201)
async def add_mcp(body: McpIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    url = validate_base_url(body.url, settings.allow_private_model_endpoints)
    try:
        enc = encrypt(body.authorization.strip()) if body.authorization and body.authorization.strip() else None
    except SecretUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    s = McpServer(organization_id=membership.organization_id, name=body.name.strip(), url=url, auth_header_encrypted=enc,
                  allowed_tools=[], created_by=membership.user_id)
    db.add(s)
    await db.flush()
    await audit(db, membership, "mcp.added", "mcp_server", s.id, url=url)
    await db.commit()
    return mcp_out(s)


@router.get("/mcp/{server_id}/tools")
async def discover(server_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    s = await get_mcp(db, membership, server_id)
    tools = await mcp_list_tools(s)
    return [{**t, "allowed": t["name"] in (s.allowed_tools or [])} for t in tools]


@router.put("/mcp/{server_id}/allowed-tools")
async def set_allowed(server_id: uuid.UUID, body: AllowIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    s = await get_mcp(db, membership, server_id)
    s.allowed_tools = sorted({t[:128] for t in body.allowed_tools})
    await audit(db, membership, "mcp.tools_allowed", "mcp_server", s.id, tools=s.allowed_tools)
    await db.commit()
    return mcp_out(s)


@router.delete("/mcp/{server_id}", status_code=204)
async def delete_mcp(server_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    s = await get_mcp(db, membership, server_id)
    await db.delete(s)
    await audit(db, membership, "mcp.removed", "mcp_server", server_id)
    await db.commit()


def tool_name(server_index: int, name: str) -> str:
    return f"mcp{server_index}__" + re.sub(r"[^A-Za-z0-9_-]", "_", name)[:50]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
