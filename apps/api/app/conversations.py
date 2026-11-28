# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Chat v2: saved conversations, personas, personal instructions, attachments,
optional grounding on a knowledge collection, and streamed answers (Server-Sent Events)."""
import base64
import json
from types import SimpleNamespace
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .chat import call_model, record_usage, resolve_call, logger
from .db import get_db
from .guardrails import UNTRUSTED_NOTE, fence
from .identity import current_membership
from .knowledge import extract_text, get_collection, retrieve
from .models import ChatMessage, Conversation, Membership, Organization, User
from .providers import MODEL_NAME
from .ratelimit import enforce

router = APIRouter(prefix="/api/v1", tags=["conversations"])

PERSONAS = {
    "assistant": ("General assistant", "Helpful, clear and accurate. Ask a short clarifying question only when the request is ambiguous."),
    "analyst": ("Business analyst", "Structure answers with numbers, assumptions, risks and a recommendation. Use tables when comparing options."),
    "writer": ("Writer and editor", "Write polished, natural prose. Match the reader and the channel. Offer one alternative phrasing when useful."),
    "it_expert": ("IT and cloud expert", "Think like a senior infrastructure and ITSM engineer. Give commands, configurations and checks step by step, with risks."),
    "coder": ("Software engineer", "Write correct, idiomatic code with brief explanations. Point out edge cases and security issues."),
    "tutor": ("Tutor", "Explain from first principles with examples, then check understanding with one question."),
}
STYLES = {"concise": "Keep answers short: lead with the answer, at most a few sentences or bullets.",
          "balanced": "Answer directly, then add the detail that matters.",
          "detailed": "Give thorough answers with context, steps and examples."}
HISTORY_MESSAGES = 30
MAX_ATTACHMENT_CHARS = 60_000
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}
MAX_IMAGE_BYTES = 4_000_000


class ConversationIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    persona: str = Field(default="assistant", max_length=40)
    connection_id: uuid.UUID | None = None
    model: str = Field(default="", max_length=200)
    collection_id: uuid.UUID | None = None
    pinned: bool = False


class Attachment(BaseModel):
    name: str = Field(max_length=300)
    kind: str = Field(pattern="^(text|image)$")
    text: str | None = Field(default=None, max_length=MAX_ATTACHMENT_CHARS)
    data_url: str | None = Field(default=None, max_length=6_000_000)


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    attachments: list[Attachment] = Field(default_factory=list, max_length=5)


def conv_out(c: Conversation) -> dict:
    return {"id": str(c.id), "title": c.title, "persona": c.persona, "connection_id": str(c.connection_id) if c.connection_id else None,
            "model": c.model, "collection_id": str(c.collection_id) if c.collection_id else None, "pinned": c.pinned,
            "updated_at": c.updated_at.isoformat()}


def msg_out(m: ChatMessage) -> dict:
    return {"id": str(m.id), "role": m.role, "content": m.content, "attachments": m.attachments or [], "sources": m.sources or [],
            "model": m.model, "tokens": m.prompt_tokens + m.completion_tokens, "created_at": m.created_at.isoformat()}


async def get_conv(db, membership, cid) -> Conversation:
    c = await db.scalar(select(Conversation).where(Conversation.id == cid, Conversation.organization_id == membership.organization_id,
                                                   Conversation.user_id == membership.user_id))
    if not c:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


async def _validate(db, membership, body: ConversationIn):
    if body.persona not in PERSONAS:
        raise HTTPException(status_code=400, detail="Unknown persona")
    if body.model and not MODEL_NAME.match(body.model.strip()):
        raise HTTPException(status_code=400, detail="Invalid model name")
    if body.collection_id:
        await get_collection(db, membership, body.collection_id)


@router.get("/chat/personas")
async def personas(membership: Membership = Depends(current_membership)):
    return [{"id": k, "name": v[0], "description": v[1]} for k, v in PERSONAS.items()]


@router.get("/conversations")
async def list_conversations(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Conversation).where(Conversation.organization_id == membership.organization_id,
                                                        Conversation.user_id == membership.user_id)
                             .order_by(Conversation.pinned.desc(), Conversation.updated_at.desc()).limit(100))).scalars().all()
    return [conv_out(c) for c in rows]


@router.post("/conversations", status_code=201)
async def create_conversation(body: ConversationIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    await _validate(db, membership, body)
    c = Conversation(organization_id=membership.organization_id, user_id=membership.user_id, title=(body.title or "New chat").strip(),
                     persona=body.persona, connection_id=body.connection_id, model=body.model.strip(), collection_id=body.collection_id,
                     pinned=body.pinned)
    db.add(c)
    await db.commit()
    return conv_out(c)


@router.get("/conversations/{cid}")
async def read_conversation(cid: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, membership, cid)
    msgs = (await db.execute(select(ChatMessage).where(ChatMessage.conversation_id == c.id).order_by(ChatMessage.created_at))).scalars().all()
    return {**conv_out(c), "messages": [msg_out(m) for m in msgs]}


@router.put("/conversations/{cid}")
async def update_conversation(cid: uuid.UUID, body: ConversationIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, membership, cid)
    await _validate(db, membership, body)
    c.title = (body.title or c.title).strip()
    c.persona, c.connection_id, c.model, c.collection_id, c.pinned = body.persona, body.connection_id, body.model.strip(), body.collection_id, body.pinned
    await db.commit()
    return conv_out(c)


@router.delete("/conversations/{cid}", status_code=204)
async def delete_conversation(cid: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, membership, cid)
    await db.delete(c)
    await db.commit()


def _looks_like_image(data: bytes) -> bool:
    return (data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff") or data[:6] in (b"GIF87a", b"GIF89a")
            or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"))


@router.post("/chat/attachments")
async def attachment(file: UploadFile = File(...), membership: Membership = Depends(current_membership)):
    """Extract a chat attachment. Nothing is stored: the client sends it back with the message."""
    await enforce(f"attach:{membership.user_id}", 30)
    name = (file.filename or "file").strip()[:300]
    data = await file.read(MAX_IMAGE_BYTES + 1)
    ext = "." + name.lower().rsplit(".", 1)[-1] if "." in name else ""
    if ext in IMAGE_TYPES:
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Images are limited to 4 MB")
        if not _looks_like_image(data):
            raise HTTPException(status_code=400, detail="This file is not a valid image")
        return {"name": name, "kind": "image", "data_url": f"data:{IMAGE_TYPES[ext]};base64,{base64.b64encode(data).decode()}"}
    text, _ = extract_text(name, data)
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="This file has no readable text")
    return {"name": name, "kind": "text", "text": text[:MAX_ATTACHMENT_CHARS], "truncated": len(text) > MAX_ATTACHMENT_CHARS}


def system_prompt(user: User, conv: Conversation, guard: bool) -> str:
    name, persona = PERSONAS.get(conv.persona, PERSONAS["assistant"])
    parts = [f"You are Galdus, acting as a {name.lower()}. {persona}", STYLES.get(user.response_style, STYLES["balanced"]),
             "Use Markdown for structure. Reply in the language the user writes in.",
             f"The user's name is {user.full_name}. Today is {datetime.now(timezone.utc):%A %d %B %Y} (UTC)."]
    if user.custom_instructions:
        parts.append(f"The user asked you to keep this in mind:\n{user.custom_instructions}")
    if guard:
        parts.append(UNTRUSTED_NOTE)
    return "\n\n".join(parts)


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/conversations/{cid}/messages")
async def send_message(cid: uuid.UUID, body: MessageIn, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    """Stream the assistant's answer as Server-Sent Events: meta, delta*, done | error."""
    conv = await get_conv(db, membership, cid)
    user = await db.get(User, membership.user_id)
    org = await db.get(Organization, membership.organization_id)
    guard = bool(org and org.guardrails_enabled)
    label, kwargs = await resolve_call(db, membership, conv.connection_id, conv.model or None)

    history = (await db.execute(select(ChatMessage).where(ChatMessage.conversation_id == conv.id)
                                .order_by(ChatMessage.created_at.desc()).limit(HISTORY_MESSAGES))).scalars().all()[::-1]
    system = system_prompt(user, conv, guard)
    sources: list[dict] = []
    if conv.collection_id:
        sources = await retrieve(db, membership, conv.collection_id, body.content, k=5)
        if sources:
            block, _ = fence("\n\n".join(f"[{i + 1}] {s['title']} (part {s['chunk'] + 1}):\n{s['content']}" for i, s in enumerate(sources)), guard)
            system += ("\n\nAnswer from these numbered sources when relevant and cite them as [1], [2]. "
                       f"Say so if they do not contain the answer.\n{block}")

    texts = [a for a in body.attachments if a.kind == "text" and a.text]
    images = [a for a in body.attachments if a.kind == "image" and a.data_url and a.data_url.startswith("data:image/")]
    user_text = body.content
    if texts:
        joined, _ = fence("\n\n".join(f"Attached file {a.name}:\n{a.text}" for a in texts), guard)
        user_text = f"{body.content}\n\n{joined}"
    content: str | list = user_text
    if images:
        content = [{"type": "text", "text": user_text}] + [{"type": "image_url", "image_url": {"url": a.data_url}} for a in images]

    messages = [{"role": "system", "content": system}] + [{"role": m.role, "content": m.content} for m in history] + \
               [{"role": "user", "content": content}]

    user_msg = ChatMessage(conversation_id=conv.id, role="user", content=body.content,
                           attachments=[{"name": a.name, "kind": a.kind} for a in body.attachments])
    db.add(user_msg)
    if conv.title == "New chat":
        conv.title = body.content.strip().splitlines()[0][:60] or "New chat"
    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    conv_id = conv.id
    title = conv.title
    public_sources = [{k: s[k] for k in ("title", "document_id", "chunk", "score")} | {"excerpt": s["content"][:300]} for s in sources]

    async def stream():
        started = time.monotonic()
        yield sse({"type": "meta", "model": label, "title": title, "sources": public_sources})
        text, usage = "", None
        try:
            response = await call_model(label, kwargs, messages, stream=True, stream_options={"include_usage": True})
            async for chunk in response:
                if getattr(chunk, "usage", None):
                    usage = chunk.usage
                choices = getattr(chunk, "choices", None) or []
                delta = getattr(choices[0].delta, "content", None) if choices else None
                if delta:
                    text += delta
                    yield sse({"type": "delta", "text": delta})
        except HTTPException as exc:
            yield sse({"type": "error", "message": str(exc.detail)})
            return
        except Exception as exc:
            logger.warning("Streaming failed: %s", type(exc).__name__)
            yield sse({"type": "error", "message": f"The model stopped unexpectedly ({type(exc).__name__})."})
            if not text:
                return
        # FastAPI >= 0.118 keeps yield dependencies (this db session) open until the stream ends.
        estimate = SimpleNamespace(prompt_tokens=len(json.dumps(messages)) // 4, completion_tokens=len(text) // 4)
        p, c = record_usage(db, membership, label, SimpleNamespace(usage=usage or estimate))
        msg = ChatMessage(conversation_id=conv_id, role="assistant", content=text, sources=public_sources, model=label,
                          prompt_tokens=p, completion_tokens=c)
        db.add(msg)
        await db.commit()
        yield sse({"type": "done", "message_id": str(msg.id), "tokens": p + c, "ms": int((time.monotonic() - started) * 1000)})

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@router.delete("/conversations/{cid}/messages/last", status_code=204)
async def drop_last_answer(cid: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    """Remove the last assistant answer and the user message before it (used by Regenerate)."""
    conv = await get_conv(db, membership, cid)
    last = (await db.execute(select(ChatMessage).where(ChatMessage.conversation_id == conv.id)
                             .order_by(ChatMessage.created_at.desc()).limit(2))).scalars().all()
    ids = []
    if last and last[0].role == "user":
        ids = [last[0].id]
    elif len(last) == 2 and last[0].role == "assistant" and last[1].role == "user":
        ids = [last[0].id, last[1].id]
    if ids:
        await db.execute(delete(ChatMessage).where(ChatMessage.id.in_(ids)))
        await db.commit()
