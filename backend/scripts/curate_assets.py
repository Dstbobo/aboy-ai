"""Phase 1 curate pipeline (offline).

For each registry image: capture license/attribution → license gate → download
→ upload to Supabase Storage → set asset_url. License-incompatible images are
marked servable=false (hidden from BOTH storage and proxy) and logged.

Reports the incompatible breakdown BEFORE uploading anything.

Usage:  python -m scripts.curate_assets
"""
import asyncio
import re
import socket
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

import asyncpg
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.core.media.storage import ensure_bucket, upload_image, slugify, ext_for  # noqa: E402

_UA = "AboyAI/1.0 (https://aboyai.com; medical education) curate"
_COMMONS = "https://commons.wikimedia.org/w/api.php"
DB = dict(
    host=socket.getaddrinfo("aws-1-eu-central-1.pooler.supabase.com", 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0],
    port=6543, user="postgres.szsdvkziqskrfveuemsi", password="452345Dst@ff",
    database="postgres", ssl="require", statement_cache_size=0,
)

_TAG = re.compile(r"<[^>]+>")
# Compatible: CC0 / Public Domain / CC-BY / CC-BY-SA. Reject NC, ND, GFDL-only, unknown.
_REJECT = re.compile(r"non-?commercial|\bnc\b|-nc|no[ -]?deriv|\bnd\b|-nd", re.IGNORECASE)
_ACCEPT = re.compile(
    r"cc0|public domain|\bpd\b|cc[ -]?by|creative commons attribution|"
    r"no restrictions|no known (?:copyright|restrictions)",
    re.IGNORECASE,
)


def license_ok(lic: str | None) -> bool:
    if not lic:
        return False
    if _REJECT.search(lic):
        return False
    return bool(_ACCEPT.search(lic))


def _clean(html: str) -> str:
    return re.sub(r"\s+", " ", _TAG.sub("", html or "")).strip()[:200]


async def capture_license(client: httpx.AsyncClient, row: dict) -> tuple[str, str]:
    """Return (license, attribution) for a registry row."""
    source = (row.get("source") or "").lower()
    if "pubchem" in source:
        return "Public Domain", "National Library of Medicine (NCBI/PubChem)"
    page = row.get("page_url") or ""
    if "commons.wikimedia.org/wiki/" in page:
        title = unquote(page.split("/wiki/", 1)[1])
        try:
            r = await client.get(_COMMONS, params={
                "action": "query", "format": "json", "titles": title,
                "prop": "imageinfo", "iiprop": "extmetadata",
            })
            pages = (r.json().get("query") or {}).get("pages") or {}
            meta = next(iter(pages.values()), {}).get("imageinfo", [{}])[0].get("extmetadata", {})
            lic = _clean(meta.get("LicenseShortName", {}).get("value", ""))
            attr = (_clean(meta.get("Attribution", {}).get("value", ""))
                    or _clean(meta.get("Artist", {}).get("value", ""))
                    or _clean(meta.get("Credit", {}).get("value", ""))
                    or "Wikimedia Commons")
            return lic, attr
        except Exception:
            return "", "Wikimedia Commons"
    return "", row.get("source") or ""


async def main() -> None:
    await ensure_bucket()
    conn = await asyncpg.connect(**DB)
    rows = [dict(r) for r in await conn.fetch(
        "SELECT concept, url, title, source, page_url, found FROM medical_images WHERE found = TRUE"
    )]
    print(f"curating {len(rows)} images...\n")

    # ── Phase A: capture + classify licenses, report BEFORE uploading ──
    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": _UA}) as client:
        for row in rows:
            lic, attr = await capture_license(client, row)
            row["license"], row["attribution"] = lic, attr
            row["ok"] = license_ok(lic)

    compatible = [r for r in rows if r["ok"]]
    incompatible = [r for r in rows if not r["ok"]]
    print("=== LICENSE GATE (before acting) ===")
    print(f"  compatible:   {len(compatible)}")
    print(f"  incompatible: {len(incompatible)}")
    by_lic = Counter((r["license"] or "<none/unknown>") for r in incompatible)
    for lic, n in by_lic.most_common():
        print(f"     - {lic}: {n}")
    print()

    # Persist license/attribution + mark incompatible not-servable.
    for r in incompatible:
        await conn.execute(
            "UPDATE medical_images SET license=$2, attribution=$3, servable=FALSE WHERE concept=$1",
            r["concept"], r["license"], r["attribution"],
        )
        await conn.execute(
            "INSERT INTO curate_failures (concept, reason, detail) VALUES ($1,'license_incompatible',$2)",
            r["concept"], r["license"] or "unknown",
        )

    # ── Phase B: download + upload compatible images, set asset_url ──
    stored, failed = 0, 0
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": _UA}, follow_redirects=True) as client:
        for r in compatible:
            try:
                resp = await client.get(r["url"])
                ct = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                if resp.status_code != 200 or not ct.startswith("image/") or len(resp.content) < 1024:
                    raise ValueError(f"bad source {resp.status_code} {ct}")
                path = f"{slugify(r['concept'])}.{ext_for(ct)}"
                asset_url = await upload_image(path, resp.content, ct)
                if not asset_url:
                    raise ValueError("upload failed")
                await conn.execute(
                    "UPDATE medical_images SET asset_url=$2, stored_at=now(), stored_by='curate_pipeline', "
                    "license=$3, attribution=$4, servable=TRUE WHERE concept=$1",
                    r["concept"], asset_url, r["license"], r["attribution"],
                )
                stored += 1
            except Exception as exc:
                failed += 1
                await conn.execute(
                    "INSERT INTO curate_failures (concept, reason, detail) VALUES ($1,'store_failed',$2)",
                    r["concept"], str(exc)[:200],
                )
    await conn.close()
    print("=== CURATE RESULT ===")
    print(f"  stored to Supabase Storage: {stored}")
    print(f"  store failures:             {failed}")
    print(f"  hidden (license):           {len(incompatible)}")


if __name__ == "__main__":
    asyncio.run(main())
