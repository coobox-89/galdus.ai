"""Knowledge module: collections of documents, chunking, embeddings and retrieval.

Retrieval is semantic (pgvector cosine distance) when the collection has an
embedding model on a BYOK connection, and full-text (Postgres tsvector) otherwise.
Every query is scoped to the caller's organization.
"""
import io
import re
import uuid
from datetime import datetime

import litellm
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, literal_column, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .connections import call_kwargs, get_connection, require_manager
from .db import get_db
from .identity import current_membership
from .models import KnowledgeChunk, KnowledgeCollection, KnowledgeDocument, Membership
from .ratelimit import enforce
from .governance import audit

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])

MAX_UPLOAD_BYTES = 5_000_000
MAX_DOCUMENT_CHARS = 400_000
CHUNK_CHARS = 1200
CHUNK_OVERLAP = 200
EMBED_BATCH = 64


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    connection_id: uuid.UUID | None = None
    embedding_model: str | None = Field(default=None, max_length=200)


class CollectionOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    search_mode: str
    embedding_model: str | None
    documents: int
    created_at: datetime


class DocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    source_type: str
    chars: int
    chunks: int
    embedded: bool
    created_at: datetime


class TextDocument(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1, max_length=MAX_DOCUMENT_CHARS)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    k: int = Field(default=5, ge=1, le=20)


def chunk_text(content: str, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split on paragraph boundaries into ~size-character chunks with overlap."""
    content = re.sub(r"\r\n?", "\n", content).strip()
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        while len(para) > size:  # very long paragraph: hard split
            head, para = para[:size], para[size - overlap:]
            if current:
                chunks.append(current)
                current = ""
            chunks.append(head)
        if current and len(current) + len(para) + 2 > size:
            chunks.append(current)
            current = current[-overlap:] + "\n\n" + para if overlap else para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    return chunks


def extract_text(filename: str, data: bytes) -> tuple[str, str]:
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages[:500]]
        except Exception as exc:
            raise HTTPException(status_code=400, detail="This PDF could not be read") from exc
        return "\n\n".join(pages), "pdf"
    if name.endswith((".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm", ".log")):
        return data.decode("utf-8", errors="replace"), "text"
    raise HTTPException(status_code=400, detail="Supported files: .pdf, .txt, .md, .csv, .json, .html, .log")


async def get_collection(db: AsyncSession, membership: Membership, collection_id: uuid.UUID) -> KnowledgeCollection:
    col = await db.scalar(select(KnowledgeCollection).where(
        KnowledgeCollection.id == collection_id, KnowledgeCollection.organization_id == membership.organization_id))
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found in this workspace")
    return col


async def embed(db: AsyncSession, membership: Membership, col: KnowledgeCollection, texts: list[str]) -> list[list[float]]:
    conn = await get_connection(db, membership, col.connection_id)
    kwargs = call_kwargs(conn, col.embedding_model)
    vectors: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        try:
            result = await litellm.aembedding(input=texts[i:i + EMBED_BATCH], timeout=60, **kwargs)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Embedding request failed ({type(exc).__name__}). Check the embedding model.") from exc
        vectors.extend(item["embedding"] if isinstance(item, dict) else item.embedding for item in result.data)
    return vectors


def to_out(col: KnowledgeCollection, documents: int) -> CollectionOut:
    return CollectionOut(id=col.id, name=col.name, description=col.description,
                         search_mode="semantic" if col.embedding_model and col.connection_id else "full-text",
                         embedding_model=col.embedding_model, documents=documents, created_at=col.created_at)


@router.get("/collections", response_model=list[CollectionOut])
async def list_collections(membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    counts = select(KnowledgeDocument.collection_id, func.count().label("n")).group_by(KnowledgeDocument.collection_id).subquery()
    rows = (await db.execute(
        select(KnowledgeCollection, counts.c.n).outerjoin(counts, counts.c.collection_id == KnowledgeCollection.id)
        .where(KnowledgeCollection.organization_id == membership.organization_id).order_by(KnowledgeCollection.created_at)
    )).all()
    return [to_out(c, int(n or 0)) for c, n in rows]


@router.post("/collections", response_model=CollectionOut, status_code=201)
async def create_collection(body: CollectionCreate, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    if bool(body.connection_id) != bool(body.embedding_model):
        raise HTTPException(status_code=400, detail="Semantic search needs both a connection and an embedding model")
    if body.connection_id:
        conn = await get_connection(db, membership, body.connection_id)
        call_kwargs(conn, body.embedding_model.strip())  # validates the model name
    col = KnowledgeCollection(organization_id=membership.organization_id, name=body.name.strip(), description=body.description.strip(),
                              connection_id=body.connection_id, embedding_model=(body.embedding_model or "").strip() or None,
                              created_by=membership.user_id)
    db.add(col)
    await db.flush()
    await audit(db, membership, "knowledge.collection_created", "collection", col.id, name=col.name)
    await db.commit()
    await db.refresh(col)
    return to_out(col, 0)


@router.delete("/collections/{collection_id}", status_code=204)
async def delete_collection(collection_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    col = await get_collection(db, membership, collection_id)
    await db.delete(col)
    await audit(db, membership, "knowledge.collection_deleted", "collection", collection_id)
    await db.commit()


@router.get("/collections/{collection_id}/documents", response_model=list[DocumentOut])
async def list_documents(collection_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    await get_collection(db, membership, collection_id)
    docs = (await db.execute(select(KnowledgeDocument).where(KnowledgeDocument.collection_id == collection_id)
                             .order_by(KnowledgeDocument.created_at.desc()))).scalars().all()
    return [DocumentOut(id=d.id, title=d.title, source_type=d.source_type, chars=d.chars, chunks=d.chunks,
                        embedded=d.embedded, created_at=d.created_at) for d in docs]


async def ingest(db: AsyncSession, membership: Membership, col: KnowledgeCollection, title: str, content: str, source_type: str) -> DocumentOut:
    content = content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="The document has no extractable text")
    content = content[:MAX_DOCUMENT_CHARS]
    chunks = chunk_text(content)
    vectors = await embed(db, membership, col, chunks) if col.embedding_model and col.connection_id else None
    doc = KnowledgeDocument(organization_id=membership.organization_id, collection_id=col.id, title=title[:300],
                            source_type=source_type, chars=len(content), chunks=len(chunks), embedded=vectors is not None)
    db.add(doc)
    await db.flush()
    db.add_all([KnowledgeChunk(organization_id=membership.organization_id, collection_id=col.id, document_id=doc.id,
                               ordinal=i, content=c, embedding=vectors[i] if vectors else None) for i, c in enumerate(chunks)])
    await db.commit()
    return DocumentOut(id=doc.id, title=doc.title, source_type=doc.source_type, chars=doc.chars, chunks=doc.chunks,
                       embedded=doc.embedded, created_at=doc.created_at)


@router.post("/collections/{collection_id}/documents/text", response_model=DocumentOut, status_code=201)
async def add_text(collection_id: uuid.UUID, body: TextDocument, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    await enforce(f"ingest:{membership.user_id}", 30)
    col = await get_collection(db, membership, collection_id)
    return await ingest(db, membership, col, body.title.strip(), body.content, "text")


@router.post("/collections/{collection_id}/documents/upload", response_model=DocumentOut, status_code=201)
async def upload(collection_id: uuid.UUID, file: UploadFile = File(...), title: str | None = Form(default=None),
                 membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    await enforce(f"ingest:{membership.user_id}", 30)
    col = await get_collection(db, membership, collection_id)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Files are limited to 5 MB")
    content, source_type = extract_text(file.filename or "upload.txt", data)
    return await ingest(db, membership, col, (title or file.filename or "Untitled").strip(), content, source_type)


class UrlDocument(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


@router.post("/collections/{collection_id}/documents/url", response_model=DocumentOut, status_code=201)
async def add_url(collection_id: uuid.UUID, body: UrlDocument, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    """Import the readable text of a public web page."""
    require_manager(membership)
    from .tools import fetch_public_text
    await enforce(f"ingest:{membership.user_id}", 30)
    col = await get_collection(db, membership, collection_id)
    title, content = await fetch_public_text(body.url.strip())
    return await ingest(db, membership, col, title, content, "web")


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: uuid.UUID, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    require_manager(membership)
    result = await db.execute(delete(KnowledgeDocument).where(
        KnowledgeDocument.id == document_id, KnowledgeDocument.organization_id == membership.organization_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Document not found in this workspace")
    await audit(db, membership, "knowledge.document_deleted", "document", document_id)
    await db.commit()


def _ts_query(query: str) -> str | None:
    words = [w for w in re.findall(r"\w+", query.lower()) if len(w) > 2][:30]
    return " | ".join(f"{w}:*" for w in words) or None


async def retrieve(db: AsyncSession, membership: Membership, collection_id: uuid.UUID, query: str, k: int = 5) -> list[dict]:
    """Top-k chunks with document titles, scoped to the member's organization."""
    col = await get_collection(db, membership, collection_id)
    base = (select(KnowledgeChunk.content, KnowledgeChunk.ordinal, KnowledgeDocument.title, KnowledgeDocument.id.label("document_id"))
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeChunk.collection_id == col.id, KnowledgeChunk.organization_id == membership.organization_id))
    if col.embedding_model and col.connection_id:
        [vector] = await embed(db, membership, col, [query])
        distance = KnowledgeChunk.embedding.cosine_distance(vector)
        rows = (await db.execute(base.add_columns((1 - distance).label("score"))
                                 .where(KnowledgeChunk.embedding.is_not(None)).order_by(distance).limit(k))).all()
    else:
        tsq = _ts_query(query)
        if not tsq:
            return []
        q = func.to_tsquery(literal_column("'simple'"), tsq)
        rank = func.ts_rank(KnowledgeChunk.tsv, q)
        rows = (await db.execute(base.add_columns(rank.label("score")).where(KnowledgeChunk.tsv.op("@@")(q))
                                 .order_by(rank.desc()).limit(k))).all()
    return [{"title": r.title, "document_id": str(r.document_id), "chunk": r.ordinal, "content": r.content,
             "score": round(float(r.score), 4)} for r in rows]


@router.post("/collections/{collection_id}/search")
async def search(collection_id: uuid.UUID, body: SearchRequest, membership: Membership = Depends(current_membership), db: AsyncSession = Depends(get_db)):
    await enforce(f"search:{membership.user_id}", 60)
    return await retrieve(db, membership, collection_id, body.query, body.k)
