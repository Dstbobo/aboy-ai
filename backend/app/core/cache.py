"""
Redis cache + sliding-window rate limiting (redis.asyncio).

Cache layers:
  - exact response cache  (qhash -> full response)   24h
  - embedding cache       (qhash -> vector)            7d
  - tavily cache          (qhash -> web results)       2h
All best-effort: if Redis is unavailable every helper degrades to a miss /
no-op so the pipeline still works.
"""
import hashlib
import json
import re
import time
from typing import Any

import redis.asyncio as aioredis

from app.config import get_settings

_client: aioredis.Redis | None = None
_init_tried = False

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
    try:
        await r.set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass


# ── Sliding-window rate limit ────────────────────────────────────────────────
async def sliding_window_allow(user_id: str, limit: int, window_seconds: int = 86400) -> tuple[bool, int]:
    """Returns (allowed, current_count). No-op (allow) if Redis is down."""
    r = get_redis()
    if r is None:
        return True, 0
    key = f"rl:{user_id}"
    now = time.time()
    try:
        async with r.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            pipe.zcard(key)
            pipe.zadd(key, {f"{now}": now})
            pipe.expire(key, window_seconds)
            _, count, _, _ = await pipe.execute()
        return (count < limit), int(count)
    except Exception:
        return True, 0
