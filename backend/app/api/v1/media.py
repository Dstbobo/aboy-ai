"""Image resolution endpoint (permanent circuit-breaker design).

Primary path: registry has an owned `asset_url` → 302 redirect to Supabase
Storage (bytes go app→CDN directly; we still log the decision).

Fallback path (`fb=1`, or no owned asset): stream the upstream image through
this thin proxy — host allow-listed, proper User-Agent, per-domain outbound
rate limiting, 24h cache, fast 502 (never hangs). Used for unmigrated rows and
when the owned asset fails to load on the client.

Every request increments compact per-day counters (no per-request rows).
"""

import time
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, Response

from app.core.cache import cache_get, cache_set
from app.db.supabase import get_db
from app.utils.background import fire_and_forget

router = APIRouter()

_ALLOWED_HOSTS = {
    "upload.wikimedia.org",
    "commons.wikimedia.org",
    "pubchem.ncbi.nlm.nih.gov",
}
_UA = "AboyAI/1.0 (https://aboyai.com; medical education) image-proxy"
_PROXY_TTL = 24 * 60 * 60

# ── Simple per-domain outbound rate limiting (token bucket, per process) ──
_RATE = {"pubchem.ncbi.nlm.nih.gov": 10.0, "upload.wikimedia.org": 30.0, "commons.wikimedia.org": 30.0}
_buckets: dict[str, list[float]] = {}


def _allow_outbound(host: str) -> bool:
    rate = _RATE.get(host, 20.0)
    now = time.monotonic()
    tokens, last = _buckets.get(host, [rate, now])
    tokens = min(rate, tokens + (now - last) * rate)
    if tokens < 1.0:
        _buckets[host] = [tokens, now]
        return False
    _buckets[host] = [tokens - 1.0, now]
    return True


async def _log(concept: str, path: str, reason: str, status: str) -> None:
    try:
        db = await get_db()
        await db.rpc("bump_image_stat", {
            "p_concept": concept or "", "p_path": path,
            "p_reason": reason or "", "p_status": status,
        }).execute()
    except Exception:
        pass


async def _registry_by_source(url: str) -> dict | None:
    try:
        db = await get_db()
        res = await db.table("medical_images").select(
            "concept, asset_url, servable"
        ).eq("url", url).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception:
        return None


@router.get("/img")
async def image_resolve(
    u: str = Query(..., description="Upstream source image URL"),
    fb: int = Query(0, description="1 = force upstream fallback (owned asset failed)"),
) -> Response:
    t0 = time.monotonic()
    row = await _registry_by_source(u)
    concept = (row or {}).get("concept") or ""

    # License-incompatible rows are never served by either path.
    if row and row.get("servable") is False:
        raise HTTPException(status_code=404, detail="not servable")

    # ── Primary: redirect to our owned Supabase asset ──
    if not fb and row and row.get("asset_url"):
        fire_and_forget(_log(concept, "primary", "", "success"))
        return RedirectResponse(row["asset_url"], status_code=302)

    # ── Fallback: stream upstream through the proxy ──
    reason = "storage_error" if fb else "unmigrated"
    parsed = urlparse(u)
    host = parsed.netloc.lower()
    if parsed.scheme != "https" or host not in _ALLOWED_HOSTS:
        fire_and_forget(_log(concept, "fallback", reason, "failure"))
        raise HTTPException(status_code=400, detail="URL host not allowed")

    cache_key = f"imgproxy:{u}"
    cached = await cache_get(cache_key)
    if cached:
        fire_and_forget(_log(concept, "fallback", reason, "success"))
        return Response(content=bytes.fromhex(cached["b"]), media_type=cached["ct"],
                        headers={"Cache-Control": "public, max-age=604800"})

    if not _allow_outbound(host):
        fire_and_forget(_log(concept, "fallback", "rate_limited", "failure"))
        raise HTTPException(status_code=429, detail="upstream rate limited")

    try:
        async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": _UA}, follow_redirects=True) as client:
            resp = await client.get(u)
    except Exception:
        fire_and_forget(_log(concept, "fallback", "upstream_error", "failure"))
        raise HTTPException(status_code=502, detail="upstream fetch failed")

    ct = resp.headers.get("content-type", "")
    if resp.status_code != 200 or not ct.startswith("image/"):
        fire_and_forget(_log(concept, "fallback", "upstream_error", "failure"))
        raise HTTPException(status_code=502, detail=f"upstream {resp.status_code}")

    fire_and_forget(cache_set(cache_key, {"b": resp.content.hex(), "ct": ct}, _PROXY_TTL))
    fire_and_forget(_log(concept, "fallback", reason, "success"))
    _ = time.monotonic() - t0
    return Response(content=resp.content, media_type=ct,
                    headers={"Cache-Control": "public, max-age=604800"})
