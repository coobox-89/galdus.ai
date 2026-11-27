import logging
import secrets
import time
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException

from .admin import router as admin_router
from .agents import router as agents_router
from .knowledge import router as knowledge_router
from .automation import router as automation_router
from .governance import router as governance_router
from .tools import router as integrations_router
from .accounts import router as accounts_router
from .connectors import router as connectors_router
from .conversations import router as conversations_router
from .mfa import router as mfa_router
from .chat import router as chat_router
from .connections import router as models_router
from .config import settings
from .db import get_db
from .identity import router as identity_router
from .logs import configure as configure_logging, request_id
from .onboarding import router as onboarding_router
from .version import VERSION

configure_logging(settings.log_format, settings.log_level)
logger = logging.getLogger("galdus.http")

DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

app = FastAPI(
    title="Galdus.ai API",
    version=VERSION,
    description="REST API of Galdus.ai. Authenticate with `Authorization: Bearer <token>` from /api/v1/auth/login; "
                "workspace-scoped endpoints read the optional `X-Organization-Id` header.",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    rid = request.headers.get("x-request-id", "")[:64]
    rid = rid if rid.replace("-", "").isalnum() else secrets.token_hex(8)
    token = request_id.set(rid)
    started = time.monotonic()
    try:
        try:
            response = await _guarded(request, call_next)
        except Exception as exc:  # anything unhandled still gets the uniform error body and the headers below
            response = await unhandled_error(request, exc)
    finally:
        request_id.reset(token)
    response.headers["X-Request-ID"] = rid
    route = request.scope.get("route")
    # The route template, never the raw path or query string (tokens, OAuth codes, search terms).
    path = getattr(route, "path", None) or "unmatched"
    if path not in ("/health",):
        logger.info("request", extra={"fields": {"request_id": rid, "method": request.method, "route": path,
                                                 "status": response.status_code, "ms": int((time.monotonic() - started) * 1000)}})
    return response


async def _guarded(request: Request, call_next):
    length = request.headers.get("content-length")
    path = request.url.path
    limit = 6_000_000 if path.endswith(("/documents/upload", "/chat/attachments")) or "/conversations/" in path else settings.max_request_bytes
    if length and length.isdigit() and int(length) > limit:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    if request.method in ("POST", "PUT", "PATCH") and not length and "chunked" in request.headers.get("transfer-encoding", "").lower():
        return JSONResponse(status_code=411, content={"detail": "Content-Length is required"})
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if not request.url.path.startswith(DOCS_PATHS):
        # JSON and redirects only: nothing on the API needs to run scripts or be framed.
        response.headers.setdefault("Content-Security-Policy", API_CSP)
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
app.include_router(mfa_router)
app.include_router(onboarding_router)


def _error(status: int, detail, headers=None) -> JSONResponse:
    """Every error has the same shape: {"detail": ..., "request_id": ...}."""
    return JSONResponse(status_code=status, content={"detail": detail, "request_id": request_id.get()}, headers=headers)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return _error(exc.status_code, exc.detail, getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Field locations and messages only: the submitted values (passwords, keys) are not echoed back.
    return _error(422, [{"loc": list(e.get("loc", [])), "msg": e.get("msg", "Invalid value"), "type": e.get("type", "")}
                        for e in exc.errors()])


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    logger.error("unhandled error", exc_info=exc, extra={"fields": {"route": getattr(request.scope.get("route"), "path", "unmatched")}})
    return _error(500, "Something went wrong on our side. Try again; if it keeps happening, share the request id with support.")


@app.get("/health", tags=["operations"])
async def health():
    """Liveness: the process answers. Does not touch the database (safe for uptime pings that wake the service)."""
    return {"status": "ok", "service": "galdus-api", "version": VERSION, "environment": settings.environment}


@lru_cache(maxsize=1)
def migration_head() -> tuple[str | None, frozenset[str]]:
    """(head revision, all known revisions) from the bundled Alembic scripts; (None, {}) if unavailable."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        root = Path(__file__).resolve().parent.parent
        cfg = Config(str(root / "alembic.ini"))
        cfg.set_main_option("script_location", str(root / "migrations"))
        script = ScriptDirectory.from_config(cfg)
        return script.get_current_head(), frozenset(r.revision for r in script.walk_revisions())
    except Exception:  # pragma: no cover - packaging problem, reported as "unknown"
        return None, frozenset()


@app.get("/readyz", tags=["operations"])
async def readiness(db: AsyncSession = Depends(get_db)):
    """Readiness: the database answers and its schema is not behind this release (migrations applied)."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        return _error(503, "Database is not ready")
    head, known = migration_head()
    migrations = "unknown"
    if head:
        try:
            current = (await db.execute(text("SELECT version_num FROM alembic_version"))).scalar()
        except Exception:
            current = None
        if isinstance(current, str):
            migrations = "ok" if current == head else ("pending" if current in known else "ahead")
    if migrations == "pending":
        return _error(503, "Database migrations are pending: run `alembic upgrade head`")
    return {"status": "ready", "database": "ok", "migrations": migrations, "version": VERSION}
