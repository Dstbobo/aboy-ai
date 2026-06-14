"""Image proxy.

The mobile app's native image loader (Fresco/okhttp) sends a generic
User-Agent, which Wikimedia/PubChem can reject (403/429) for hotlinking — so
remote medical images silently failed to render on device. We proxy them
through the backend with a proper User-Agent and an allow-list (SSRF-safe), so
the phone always loads from a host we control and images render reliably.
"""

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

router = APIRouter()

_ALLOWED_HOSTS = {
    "upload.wikimedia.org",
    "commons.wikimedia.org",
    "pubchem.ncbi.nlm.nih.gov",
}
_UA = "AboyAI/1.0 (https://aboyai.com; medical education) image-proxy"


@router.get("/img")
async def image_proxy(u: str = Query(..., description="Absolute image URL to proxy")) -> Response:
    parsed = urlparse(u)
    if parsed.scheme != "https" or parsed.netloc.lower() not in _ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="URL host not allowed")
    try:
        async with httpx.AsyncClient(
            timeout=20.0, headers={"User-Agent": _UA}, follow_redirects=True
        ) as client:
            resp = await client.get(u)
    except Exception:
        raise HTTPException(status_code=502, detail="upstream fetch failed")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"upstream {resp.status_code}")

    content_type = resp.headers.get("content-type", "")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=502, detail="not an image")

    return Response(
        content=resp.content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=604800"},  # 7 days
    )
