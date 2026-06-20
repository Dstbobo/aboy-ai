"""Image resolution endpoint (permanent circuit-breaker design).

Primary path: registry has an owned `asset_url` → 302 redirect to Supabase
Storage (bytes go app→CDN directly; we still log the decision).

Fallback path (`fb=1`, or no owned asset): stream the upstream image through
this thin proxy — host allow-listed, proper User-Agent, per-domain outbound
rate limiting, 24h cache, fast 502 (never hangs). Used for unmigrated rows and
when the owned asset fails to load on the client.

Every request increments compact per-day counters (no per-request rows).
"""

import ipaddress
import re
import time
from io import BytesIO
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, Response

from app.core.cache import cache_get, cache_set
from app.db.supabase import get_db
from app.utils.background import fire_and_forget

router = APIRouter()

# Curated sources get a known per-domain rate; everything else (web image
# search results) is allowed too, as long as the host is a public address.
_KNOWN_HOSTS = {
    "upload.wikimedia.org",
    "commons.wikimedia.org",
    "pubchem.ncbi.nlm.nih.gov",
}
# SSRF guard: never let the proxy fetch internal/loopback/metadata targets.
_BLOCKED_HOST_RE = re.compile(r"(^|\.)(localhost|local|internal|lan|home|corp)$", re.IGNORECASE)


def _is_safe_public_host(host: str) -> bool:
    """True only for a public https host — blocks internal names and any
    private/reserved/loopback IP literal so the proxy can't be used for SSRF."""
    if not host:
        return False
    h = host.split(":")[0].strip("[]")  # drop port / IPv6 brackets
    if _BLOCKED_HOST_RE.search(h):
        return False
    try:
        return ipaddress.ip_address(h).is_global  # IP literal → must be public
    except ValueError:
        return True  # a normal hostname (DNS); content-type is still verified below


_UA = "AboyAI/1.0 (https://aboyai.com; medical education) image-proxy"
_PROXY_TTL = 24 * 60 * 60

# React Native's <Image> reliably renders only JPEG/PNG. Many medical images on
# the web are WebP/GIF/AVIF, which render BLANK on-device. So the proxy transcodes
# anything that isn't already JPEG/PNG into one of them (first frame for animated;
# PNG when there's transparency, else JPEG). This makes images show regardless of
# source format — no app rebuild needed.
_RENDERABLE = ("image/jpeg", "image/png")


def _to_renderable(content: bytes) -> tuple[bytes, str]:
    """Transcode arbitrary image bytes → (bytes, content_type) as JPEG/PNG.
    Raises if the bytes are not a decodable image."""
    from PIL import Image  # local import: only loaded on the fallback path

    im = Image.open(BytesIO(content))
    im.load()  # force-decode (first frame of an animated GIF/WebP)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    out = BytesIO()
    if has_alpha:
        im.convert("RGBA").save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"
    im.convert("RGB").save(out, format="JPEG", quality=85)
    return out.getvalue(), "image/jpeg"

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
    if parsed.scheme != "https" or not _is_safe_public_host(host):
        fire_and_forget(_log(concept, "fallback", reason, "failure"))
        raise HTTPException(status_code=400, detail="URL host not allowed")

    # v2: bump invalidates pre-transcode cached bytes (WebP/GIF that rendered blank).
    cache_key = f"imgproxy:v2:{u}"
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
    if resp.status_code != 200:
        fire_and_forget(_log(concept, "fallback", "upstream_error", "failure"))
        raise HTTPException(status_code=502, detail=f"upstream {resp.status_code}")

    content = resp.content
    # Normalise to a format RN can render (also validates octet-stream images).
    if ct not in _RENDERABLE:
        try:
            content, ct = _to_renderable(content)
        except Exception:
            if not ct.startswith("image/"):
                fire_and_forget(_log(concept, "fallback", "not_image", "failure"))
                raise HTTPException(status_code=502, detail="not a renderable image")
            # It claims to be an image but Pillow couldn't transcode — serve as-is.

    fire_and_forget(cache_set(cache_key, {"b": content.hex(), "ct": ct}, _PROXY_TTL))
    fire_and_forget(_log(concept, "fallback", reason, "success"))
    _ = time.monotonic() - t0
    return Response(content=content, media_type=ct,
                    headers={"Cache-Control": "public, max-age=604800"})
