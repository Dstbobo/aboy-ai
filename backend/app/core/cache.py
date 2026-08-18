"""
Redis cache + sliding-window rate limiting (redis.asyncio).

Cache layers:
  - exact response cache  (qhash -> full response)   24h
  - embedding cache       (qhash -> vector)            7d
  - tavily cache          (qhash -> web results)       2h
All best-effort: if Redis is unavailable every helper degrades to a miss /
no-op so the pipeline still works.
"""
import asyncio
import contextlib
import hashlib
import json
import re
import time
from collections import deque
from typing import Any

import redis.asyncio as aioredis

from app.config import get_settings

_client: aioredis.Redis | None = None
_init_tried = False
_local_rate_windows: dict[str, deque[float]] = {}
_local_rate_lock = asyncio.Lock()
_MAX_LOCAL_RATE_KEYS = 10_000

TTL_RESPONSE = 24 * 60 * 60   # 24h medical facts
TTL_EMBEDDING = 7 * 24 * 60 * 60  # 7d
TTL_TAVILY = 2 * 60 * 60      # 2h guidelines


def get_redis() -> aioredis.Redis | None:
    global _client, _init_tried
    if _client is not None:
        return _client
    if _init_tried:
        return None
    _init_tried = True
    url = get_settings().redis_url
    if not url:
        return None
    try:
        _client = aioredis.from_url(
            url,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    except Exception:
        _client = None
    return _client


def normalize_query(q: str) -> str:
    return re.sub(r"\s+", " ", q.strip().lower())


def query_hash(q: str) -> str:
    return hashlib.sha256(normalize_query(q).encode("utf-8")).hexdigest()


async def cache_get(key: str) -> Any | None:
    r = get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl: int) -> None:
    r = get_redis()
    if r is None:
        return
    with contextlib.suppress(Exception):
        await r.set(key, json.dumps(value), ex=ttl)


# ── Sliding-window rate limit ────────────────────────────────────────────────
async def _local_sliding_window_allow(
    subject: str, limit: int, window_seconds: int
) -> tuple[bool, int]:
    """Bounded in-process fallback; cost controls must not fail open."""
    now = time.monotonic()
    cutoff = now - window_seconds
    async with _local_rate_lock:
        if subject not in _local_rate_windows and len(_local_rate_windows) >= _MAX_LOCAL_RATE_KEYS:
            for key in list(_local_rate_windows):
                candidate = _local_rate_windows[key]
                while candidate and candidate[0] <= cutoff:
                    candidate.popleft()
                if not candidate:
                    _local_rate_windows.pop(key, None)
            if len(_local_rate_windows) >= _MAX_LOCAL_RATE_KEYS:
                return False, 0

        window = _local_rate_windows.setdefault(subject, deque())
        while window and window[0] <= cutoff:
            window.popleft()
        if len(window) >= limit:
            return False, len(window)
        window.append(now)

        return True, len(window)


async def sliding_window_allow(
    subject: str, limit: int, window_seconds: int = 86400
) -> tuple[bool, int]:
    """Return (allowed, current_count), using a bounded fallback if Redis is down."""
    if limit <= 0 or window_seconds <= 0:
        return False, 0
    r = get_redis()
    if r is None:
        return await _local_sliding_window_allow(subject, limit, window_seconds)
    key = f"rl:{subject}"
    now = time.time()
    try:
        async with r.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            pipe.zcard(key)
            pipe.zadd(key, {str(time.time_ns()): now})
            pipe.expire(key, window_seconds)
            _, count, _, _ = await pipe.execute()
        return (count < limit), int(count)
    except Exception:
        return await _local_sliding_window_allow(subject, limit, window_seconds)
