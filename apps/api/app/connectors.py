# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Cloud-drive connectors: Google Drive and Microsoft 365 (OneDrive + SharePoint).

A workspace owner/admin connects an account with OAuth (read-only scopes). Members can
then browse files and import them into knowledge collections; imported documents keep a
reference so they can be re-synced manually or by the automation scheduler.
"""
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .crypto import decrypt, encrypt
from .db import get_db
from .governance import audit, require_role
from .identity import current_membership
from .knowledge import extract_text, get_collection, ingest
from .models import CloudConnection, KnowledgeChunk, KnowledgeDocument, Membership
from .oauth import authorize_url, configured, exchange_code, read_state, refresh

router = APIRouter(prefix="/api/v1/connectors", tags=["connectors"])

KINDS = {
    "google_drive": {"oauth": "google", "label": "Google Drive",
                     "scope": "openid email https://www.googleapis.com/auth/drive.readonly"},
    "microsoft": {"oauth": "microsoft", "label": "SharePoint and OneDrive",
                  "scope": "openid email offline_access User.Read Files.Read.All Sites.Read.All"},
}
GOOGLE_EXPORT = {"application/vnd.google-apps.document": ("text/plain", ".txt"),
                 "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
                 "application/vnd.google-apps.presentation": ("text/plain", ".txt")}
MAX_BYTES = 10_000_000


def _front(fragment: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/#/{fragment}"


def out(c: CloudConnection) -> dict:
    return {"id": str(c.id), "provider": c.provider, "label": KINDS[c.provider]["label"], "account_email": c.account_email,
            "created_at": c.created_at.isoformat()}


async def get_cloud(db, membership, cid) -> CloudConnection:
    c = await db.scalar(select(CloudConnection).where(CloudConnection.id == cid, CloudConnection.organization_id == membership.organization_id))
    if not c:
        raise HTTPException(status_code=404, detail="Cloud connection not found in this workspace")
    return c


@router.get("")
async def list_connectors(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(CloudConnection).where(CloudConnection.organization_id == membership.organization_id))).scalars().all()
    return {"available": [{"id": k, "label": v["label"], "configured": configured(v["oauth"])} for k, v in KINDS.items()],
            "connections": [out(c) for c in rows]}


@router.post("/{kind}/authorize")
async def authorize(kind: str, membership: Membership = Depends(current_membership)):
    require_role(membership, "owner", "admin")
    spec = KINDS.get(kind)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown connector")
    extra = {"access_type": "offline", "prompt": "consent"} if spec["oauth"] == "google" else {}
    url = authorize_url(spec["oauth"], "connect", spec["scope"],
                        extra_state={"k": kind, "o": str(membership.organization_id), "u": str(membership.user_id)}, extra_params=extra)
    return {"url": url}


@router.get("/{provider}/callback")
async def callback(provider: str, code: str | None = None, state: str | None = None, error: str | None = None):
    """The provider sends the browser back here. Nothing is stored yet: the code goes to the console,
    which finishes the connection with the signed-in person's session (POST .../complete). That binds the
    drive to whoever started the flow, so a consent link sent to someone else cannot attach their drive
    to another workspace."""
    if error or not code or not state or provider not in {v["oauth"] for v in KINDS.values()}:
        return RedirectResponse(_front(f"integrations?error={quote('The connection was canceled.')}"), status_code=302)
    return RedirectResponse(_front(f"integrations?connect_provider={quote(provider)}&code={quote(code)}&state={quote(state)}"),
                            status_code=302)


class CompleteIn(BaseModel):
    code: str = Field(min_length=1, max_length=4000)
    state: str = Field(min_length=10, max_length=8000)


@router.post("/{provider}/complete", status_code=201)
async def complete(provider: str, body: CompleteIn, membership: Membership = Depends(current_membership),
                   db: AsyncSession = Depends(get_db)):
    data = read_state(body.state)
    kind = data.get("k")
    if data.get("purpose") != "connect" or KINDS.get(kind, {}).get("oauth") != provider:
        raise HTTPException(status_code=400, detail="Invalid connection state.")
    if data.get("u") != str(membership.user_id) or data.get("o") != str(membership.organization_id):
        raise HTTPException(status_code=403, detail="This connection was started by another account or workspace. Start it again from Integrations.")
    require_role(membership, "owner", "admin")
    tokens = await exchange_code(provider, "connect", body.code, data)
    email = await _account_email(kind, tokens["access_token"])
    c = CloudConnection(organization_id=membership.organization_id, provider=kind, account_email=email,
                        refresh_token_encrypted=encrypt(tokens["refresh_token"]) if tokens.get("refresh_token") else None,
                        access_token_encrypted=encrypt(tokens["access_token"]),
                        expires_at=datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60),
                        created_by=membership.user_id)
    db.add(c)
    await db.flush()
    await audit(db, membership, "connector.connected", "cloud_connection", c.id, provider=kind, account=email)
    await db.commit()
    return out(c)


async def _account_email(kind: str, token: str) -> str:
    h = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=20) as http:
        if kind == "google_drive":
            r = (await http.get("https://www.googleapis.com/drive/v3/about?fields=user", headers=h)).json()
            return r.get("user", {}).get("emailAddress", "")
        r = (await http.get("https://graph.microsoft.com/v1.0/me", headers=h)).json()
        return r.get("mail") or r.get("userPrincipalName") or ""


async def access_token(db: AsyncSession, c: CloudConnection) -> str:
    if c.access_token_encrypted and c.expires_at and c.expires_at > datetime.now(timezone.utc):
        return decrypt(c.access_token_encrypted)
    if not c.refresh_token_encrypted:
        raise HTTPException(status_code=401, detail="The cloud connection expired. Reconnect it in Integrations.")
    spec = KINDS[c.provider]
    tokens = await refresh(spec["oauth"], decrypt(c.refresh_token_encrypted), spec["scope"] if spec["oauth"] == "microsoft" else None)
    c.access_token_encrypted = encrypt(tokens["access_token"])
    if tokens.get("refresh_token"):
        c.refresh_token_encrypted = encrypt(tokens["refresh_token"])
    c.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60)
    await db.commit()
    return tokens["access_token"]


async def _get(db, c, url, params=None) -> httpx.Response:
    token = await access_token(db, c)
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
        resp = await http.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="The cloud connection expired. Reconnect it in Integrations.")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"The cloud provider returned HTTP {resp.status_code}")
    return resp


# ---- Browse ----------------------------------------------------------------------

def _q(text: str) -> str:
    return text.replace("\\", "\\\\").replace("'", "\\'")


@router.get("/{connection_id}/files")
async def browse(connection_id: uuid.UUID, folder: str | None = Query(default=None, max_length=500),
                 search: str | None = Query(default=None, max_length=200),
                 membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    # The drive belongs to the person who connected it: only owners and admins may browse it.
    require_role(membership, "owner", "admin")
    c = await get_cloud(db, membership, connection_id)
    items: list[dict] = []
    if c.provider == "google_drive":
        if search:
            q = f"name contains '{_q(search)}' and trashed = false"
        else:
            q = f"'{_q(folder or 'root')}' in parents and trashed = false"
        r = (await _get(db, c, "https://www.googleapis.com/drive/v3/files", {
            "q": q, "pageSize": 100, "fields": "files(id,name,mimeType,modifiedTime,size)", "orderBy": "folder,name",
            "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"})).json()
        for f in r.get("files", []):
            folder_ = f["mimeType"] == "application/vnd.google-apps.folder"
            items.append({"id": f["id"], "name": f["name"], "folder": folder_, "modified": f.get("modifiedTime"),
                          "size": int(f.get("size", 0) or 0), "importable": not folder_})
        return {"items": items}
    # Microsoft Graph: "sites" root lists SharePoint sites; "drive:<driveId>:<itemId>" browses a folder.
    if search:
        r = (await _get(db, c, f"https://graph.microsoft.com/v1.0/me/drive/root/search(q='{_q(search)}')")).json()
        values = r.get("value", [])
    elif folder == "sites":
        r = (await _get(db, c, "https://graph.microsoft.com/v1.0/sites", {"search": "*"})).json()
        return {"items": [{"id": f"site:{s['id']}", "name": s.get("displayName") or s.get("name"), "folder": True,
                           "modified": s.get("lastModifiedDateTime"), "size": 0, "importable": False} for s in r.get("value", [])]}
    elif folder and folder.startswith("site:"):
        r = (await _get(db, c, f"https://graph.microsoft.com/v1.0/sites/{folder[5:]}/drive/root/children")).json()
        values = r.get("value", [])
    elif folder and folder.startswith("drive:"):
        _, drive_id, item_id = folder.split(":", 2)
        r = (await _get(db, c, f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/children")).json()
        values = r.get("value", [])
    else:
        r = (await _get(db, c, "https://graph.microsoft.com/v1.0/me/drive/root/children")).json()
        values = r.get("value", [])
        items.append({"id": "sites", "name": "SharePoint sites", "folder": True, "modified": None, "size": 0, "importable": False})
    for v in values:
        ref = f"drive:{v.get('parentReference', {}).get('driveId', '')}:{v['id']}"
        items.append({"id": ref, "name": v.get("name"), "folder": "folder" in v, "modified": v.get("lastModifiedDateTime"),
                      "size": int(v.get("size", 0) or 0), "importable": "file" in v})
    return {"items": items}


async def download(db, c: CloudConnection, ref: str) -> tuple[str, str, str]:
    """Return (filename, text, modified) for an external file reference."""
    if c.provider == "google_drive":
        meta = (await _get(db, c, f"https://www.googleapis.com/drive/v3/files/{quote(ref)}",
                           {"fields": "id,name,mimeType,modifiedTime,size", "supportsAllDrives": "true"})).json()
        mime = meta["mimeType"]
        if mime in GOOGLE_EXPORT:
            export_mime, ext = GOOGLE_EXPORT[mime]
            resp = await _get(db, c, f"https://www.googleapis.com/drive/v3/files/{quote(ref)}/export", {"mimeType": export_mime})
            name = meta["name"] + ext
        else:
            if int(meta.get("size", 0) or 0) > MAX_BYTES:
                raise HTTPException(status_code=413, detail="Files are limited to 10 MB")
            resp = await _get(db, c, f"https://www.googleapis.com/drive/v3/files/{quote(ref)}", {"alt": "media", "supportsAllDrives": "true"})
            name = meta["name"]
        text, _ = extract_text(name, resp.content[:MAX_BYTES])
        return name, text, meta.get("modifiedTime", "")
    _, drive_id, item_id = ref.split(":", 2)
    meta = (await _get(db, c, f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}")).json()
    if int(meta.get("size", 0) or 0) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Files are limited to 10 MB")
    name = meta.get("name", "file")
    lower = name.lower()
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/content"
    if lower.endswith((".docx", ".pptx", ".xlsx", ".doc", ".ppt", ".xls")):
        url += "?format=pdf"  # Graph converts Office files to PDF
        name += ".pdf"
    resp = await _get(db, c, url)
    text, _ = extract_text(name, resp.content[:MAX_BYTES])
    return meta.get("name", name), text, meta.get("lastModifiedDateTime", "")


class ImportIn(BaseModel):
    collection_id: uuid.UUID
    refs: list[str] = Field(min_length=1, max_length=25)


@router.post("/{connection_id}/import", status_code=201)
async def import_files(connection_id: uuid.UUID, body: ImportIn, membership: Membership = Depends(current_membership),
                       db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    c = await get_cloud(db, membership, connection_id)
    col = await get_collection(db, membership, body.collection_id)
    results = []
    for ref in body.refs:
        try:
            name, text, modified = await download(db, c, ref)
            doc = await ingest(db, membership, col, name, text, c.provider)
            d = await db.get(KnowledgeDocument, doc.id)
            d.external_connection_id, d.external_ref, d.external_modified, d.synced_at = c.id, ref[:500], modified, datetime.now(timezone.utc)
            await db.commit()
            results.append({"ref": ref, "ok": True, "title": name})
        except HTTPException as exc:
            await db.rollback()
            results.append({"ref": ref, "ok": False, "error": str(exc.detail)})
    return {"results": results}


async def resync_document(db: AsyncSession, membership: Membership, doc: KnowledgeDocument, force: bool = False) -> bool:
    """Re-import an external document if it changed. Returns True when content was refreshed."""
    c = await get_cloud(db, membership, doc.external_connection_id)
    name, text, modified = await download(db, c, doc.external_ref)
    doc.synced_at = datetime.now(timezone.utc)
    if not force and modified and modified == doc.external_modified:
        await db.commit()
        return False
    col = await get_collection(db, membership, doc.collection_id)
    fresh = await ingest(db, membership, col, doc.title, text, c.provider)
    new = await db.get(KnowledgeDocument, fresh.id)
    new.external_connection_id, new.external_ref, new.external_modified, new.synced_at = c.id, doc.external_ref, modified, datetime.now(timezone.utc)
    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id))
    await db.delete(doc)
    await db.commit()
    return True


@router.post("/documents/{document_id}/resync")
async def resync(document_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    doc = await db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.id == document_id,
                                                          KnowledgeDocument.organization_id == membership.organization_id))
    if not doc or not doc.external_ref or not doc.external_connection_id:
        raise HTTPException(status_code=404, detail="This document is not linked to a cloud drive")
    return {"updated": await resync_document(db, membership, doc, force=True)}


@router.delete("/{connection_id}", status_code=204)
async def disconnect(connection_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_role(membership, "owner", "admin")
    c = await get_cloud(db, membership, connection_id)
    await db.delete(c)
    await audit(db, membership, "connector.disconnected", "cloud_connection", connection_id, provider=c.provider)
    await db.commit()
