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

    def peek(self, key: str, limit: int, window_seconds: float = 60.0) -> float | None:
        """Like `hit` but without recording: None if fewer than `limit` hits are in the window."""
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.get(key)
            if not bucket:
                return None
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                return max(0.0, bucket[0] + window_seconds - now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    """Client address used for per-IP limits.

    CLIENT_IP_HEADER (e.g. cf-connecting-ip) wins when the edge proxy sets it and strips any copy the
    client sent. Otherwise uvicorn rewrites request.client from X-Forwarded-For for the proxies listed
    in FORWARDED_ALLOW_IPS. Per-account limits (see `failure_guard`) do not depend on this value.
    """
    if settings.client_ip_header:
        value = request.headers.get(settings.client_ip_header, "").split(",")[0].strip()
        if value:
            return value[:64]
    return request.client.host if request.client else "unknown"


logger = logging.getLogger("galdus.ratelimit")


def _window_start(now: datetime, window_seconds: int) -> datetime:
    epoch = int(now.timestamp())
    return datetime.fromtimestamp(epoch - epoch % window_seconds, tz=timezone.utc)


async def _shared_hit(key: str, limit: int, window_seconds: int = 60, count_only: bool = False) -> float | None:
    """Count the hit in Postgres (fixed windows). Fails open (allows the request) if the database is unavailable."""
    from sqlalchemy import text
    from .db import SessionLocal
    now = datetime.now(timezone.utc)
    window = _window_start(now, window_seconds)
    try:
        async with SessionLocal() as s:
            if count_only:
                count = await s.scalar(text("select count from rate_limit_counters where key = :k and window_start = :w"),
                                       {"k": key[:200], "w": window}) or 0
            else:
                count = await s.scalar(text(
                    "insert into rate_limit_counters (key, window_start, count) values (:k, :w, 1) "
                    "on conflict (key, window_start) do update set count = rate_limit_counters.count + 1 returning count"),
                    {"k": key[:200], "w": window})
                await s.commit()
    except Exception as exc:  # pragma: no cover - depends on the database being down
        logger.warning("Shared rate limit unavailable: %s", type(exc).__name__)
        return None
    if count > limit or (count_only and count >= limit):
        return (window + timedelta(seconds=window_seconds) - now).total_seconds()
    return None


async def prune_shared(db) -> int:
    """Delete finished windows (called by the scheduler tick)."""
    from sqlalchemy import text
    # Windows last at most one hour (per-account lockouts); keep a little slack.
    r = await db.execute(text("delete from rate_limit_counters where window_start < now() - interval '2 hours'"))
    return r.rowcount or 0


def _too_many(retry_after: float, detail: str = "Too many requests. Please slow down and try again shortly.") -> HTTPException:
    return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail,
                         headers={"Retry-After": str(int(retry_after) + 1)})


async def enforce(key: str, limit: int, window_seconds: int = 60) -> None:
    if not settings.rate_limit_enabled:
        return
    if settings.rate_limit_backend == "postgres":
        retry_after = await _shared_hit(key, limit, window_seconds)
    else:
        retry_after = limiter.hit(key, limit, window_seconds)
    if retry_after is not None:
        raise _too_many(retry_after)


LOCKED = "Too many failed attempts for this account. Wait a few minutes and try again, or reset your password."


class FailureGuard:
    """Per-account lockout that counts only failures (wrong password, wrong code).

    `check` raises 429 once `limit` failures happened in the current window; `fail` records one.
    The key is derived from the account (email or user id), never from the client IP, so rotating
    IPs does not help an attacker. The trade-off (someone can lock an account for one window) is
    documented in docs/security/overview.md.
    """

    def __init__(self, prefix: str, limit_setting: str, window_setting: str = "login_lockout_minutes"):
        self.prefix, self.limit_setting, self.window_setting = prefix, limit_setting, window_setting

    @property
    def limit(self) -> int:
        return getattr(settings, self.limit_setting)

    @property
    def window(self) -> int:
        return getattr(settings, self.window_setting) * 60

    def _key(self, subject: str) -> str:
        return f"{self.prefix}:{subject.lower()}"

    async def check(self, subject: str) -> None:
        if not settings.rate_limit_enabled:
            return
        key = self._key(subject)
        if settings.rate_limit_backend == "postgres":
            retry = await _shared_hit(key, self.limit, self.window, count_only=True)
        else:
            retry = limiter.peek(key, self.limit, self.window)
        if retry is not None:
            raise _too_many(retry, LOCKED)

    async def fail(self, subject: str) -> None:
        if not settings.rate_limit_enabled:
            return
        key = self._key(subject)
        if settings.rate_limit_backend == "postgres":
            await _shared_hit(key, 10**9, self.window)
        else:
            limiter.hit(key, 10**9, self.window)


login_failures = FailureGuard("login-fail", "login_max_failures")
mfa_failures = FailureGuard("mfa-fail", "mfa_max_failures")


async def auth_rate_limit(request: Request) -> None:
    await enforce(f"auth:{request.url.path}:{client_ip(request)}", settings.rate_limit_auth_per_minute)
