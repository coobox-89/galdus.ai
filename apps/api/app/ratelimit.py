"""Small in-process sliding-window rate limiter.

This protects a single API instance against brute force and runaway clients.
It is intentionally dependency-free; for multiple instances use a shared store
(e.g. Redis) or an edge rate limiter in front of the API.
"""
import time
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


def enforce(key: str, limit: int) -> None:
    if not settings.rate_limit_enabled:
        return
    retry_after = limiter.hit(key, limit)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again shortly.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )


def auth_rate_limit(request: Request) -> None:
    enforce(f"auth:{request.url.path}:{client_ip(request)}", settings.rate_limit_auth_per_minute)
