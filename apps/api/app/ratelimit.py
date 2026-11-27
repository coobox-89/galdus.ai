"""Rate limiting.

RATE_LIMIT_BACKEND=memory (default): in-process sliding window, right for a single API instance.
RATE_LIMIT_BACKEND=postgres: fixed one-minute windows counted in the shared database, so the
limits hold across every API instance without extra infrastructure.
"""
import logging
import time
from datetime import datetime, timedelta, timezone
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status

from .config import settings


class SlidingWindowLimiter:
    def __init__(self, max_keys: int = 50_000):
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()
        self._max_keys = max_keys

    def hit(self, key: str, limit: int, window_seconds: float = 60.0) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until retry."""
        now = time.monotonic()
        with self._lock:
            if len(self._hits) > self._max_keys:
                self._hits.clear()
            bucket = self._hits[key]
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                return max(0.0, bucket[0] + window_seconds - now)
            bucket.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    # uvicorn rewrites request.client from X-Forwarded-For only for trusted
    # proxies (FORWARDED_ALLOW_IPS), so this value cannot be spoofed directly.
    return request.client.host if request.client else "unknown"


logger = logging.getLogger("galdus.ratelimit")


async def _shared_hit(key: str, limit: int) -> float | None:
    """Count the hit in Postgres. Fails open (allows the request) if the database is unavailable."""
    from sqlalchemy import text
    from .db import SessionLocal
    now = datetime.now(timezone.utc)
    window = now.replace(second=0, microsecond=0)
    try:
        async with SessionLocal() as s:
            count = await s.scalar(text(
                "insert into rate_limit_counters (key, window_start, count) values (:k, :w, 1) "
                "on conflict (key, window_start) do update set count = rate_limit_counters.count + 1 returning count"),
                {"k": key[:200], "w": window})
            await s.commit()
    except Exception as exc:  # pragma: no cover - depends on the database being down
        logger.warning("Shared rate limit unavailable: %s", type(exc).__name__)
        return None
    if count > limit:
        return (window + timedelta(minutes=1) - now).total_seconds()
    return None


async def prune_shared(db) -> int:
    """Delete finished windows (called by the scheduler tick)."""
    from sqlalchemy import text
    r = await db.execute(text("delete from rate_limit_counters where window_start < now() - interval '5 minutes'"))
    return r.rowcount or 0


async def enforce(key: str, limit: int) -> None:
    if not settings.rate_limit_enabled:
        return
    retry_after = await _shared_hit(key, limit) if settings.rate_limit_backend == "postgres" else limiter.hit(key, limit)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again shortly.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )


async def auth_rate_limit(request: Request) -> None:
    await enforce(f"auth:{request.url.path}:{client_ip(request)}", settings.rate_limit_auth_per_minute)
