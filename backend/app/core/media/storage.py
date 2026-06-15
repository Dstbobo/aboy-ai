"""Supabase Storage helpers for the owned medical-asset bucket.

We host validated image bytes ourselves so request-time resolution never
depends on Wikimedia/PubChem availability. Public-read bucket (no listing) so
the app can load assets directly from Supabase's CDN.
"""

from __future__ import annotations

import re

import httpx

from app.config import get_settings

BUCKET = "medical-assets"


def _base() -> tuple[str, str]:
    s = get_settings()
    return s.supabase_url.rstrip("/"), s.supabase_service_key


def slugify(concept: str) -> str:
    """Deterministic, filesystem-safe slug for a concept key."""
    s = concept.strip().lower().replace(":", "-")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "image"


def public_url(path: str) -> str:
    base, _ = _base()
    return f"{base}/storage/v1/object/public/{BUCKET}/{path}"


async def ensure_bucket() -> bool:
    """Create the public bucket if it doesn't exist. Idempotent."""
    base, key = _base()
    headers = {"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(
            f"{base}/storage/v1/bucket",
            headers=headers,
            json={"id": BUCKET, "name": BUCKET, "public": True},
        )
    # 200 created, or already-exists → treat as success.
    if resp.status_code in (200, 201):
        return True
    if resp.status_code in (400, 409) and "exist" in resp.text.lower():
        return True
    return resp.status_code in (400, 409)


async def upload_image(path: str, data: bytes, content_type: str) -> str | None:
    """Upload (upsert) bytes to the bucket; return the public URL or None."""
    base, key = _base()
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": content_type or "application/octet-stream",
        "x-upsert": "true",
        "cache-control": "public, max-age=2592000",  # 30 days
    }
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(f"{base}/storage/v1/object/{BUCKET}/{path}", headers=headers, content=data)
    if resp.status_code in (200, 201):
        return public_url(path)
    return None


def ext_for(content_type: str) -> str:
    return {
        "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
        "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
    }.get((content_type or "").split(";")[0].strip().lower(), "png")
