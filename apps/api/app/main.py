import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .admin import router as admin_router
from .agents import router as agents_router
from .knowledge import router as knowledge_router
from .automation import router as automation_router
from .governance import router as governance_router
from .tools import router as integrations_router
from .accounts import router as accounts_router
from .connectors import router as connectors_router
from .conversations import router as conversations_router
from .chat import router as chat_router
from .connections import router as models_router
from .config import settings
from .db import get_db
from .identity import router as identity_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# LiteLLM can log request payloads at debug level; keep it quiet.
logging.getLogger("LiteLLM").setLevel(logging.WARNING)

app = FastAPI(
    title="Galdus.ai API",
    version="0.6.0",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    length = request.headers.get("content-length")
    path = request.url.path
    limit = 6_000_000 if path.endswith(("/documents/upload", "/chat/attachments")) or "/conversations/" in path else settings.max_request_bytes
    if length and length.isdigit() and int(length) > limit:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    if settings.is_production:
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


# Added last so it wraps everything (including 413 responses) with CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Organization-Id"],
    max_age=600,
)

app.include_router(identity_router)
app.include_router(chat_router)
app.include_router(admin_router)
app.include_router(models_router)
app.include_router(knowledge_router)
app.include_router(agents_router)
app.include_router(automation_router)
app.include_router(governance_router)
app.include_router(integrations_router)
app.include_router(accounts_router)
app.include_router(connectors_router)
app.include_router(conversations_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "galdus-api", "version": app.version}


@app.get("/readyz")
async def readiness(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    return {"status": "ready", "database": "ok"}
