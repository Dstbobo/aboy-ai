"""Image reliability + coverage report (offline).

Prints serving reliability (primary vs fallback), attach rate, missing concepts,
and the coverage-gap backlog (visual-intent queries with no concept) so curation
knows what users actually want next.

Usage:  python -m scripts.coverage_report
"""
import asyncio
import socket
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DB = dict(
    host=socket.getaddrinfo("aws-1-eu-central-1.pooler.supabase.com", 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0],
    port=6543, user="postgres.szsdvkziqskrfveuemsi", password="452345Dst@ff",
    database="postgres", ssl="require", statement_cache_size=0,
)


def pct(n, d):
    return f"{100 * n / d:.1f}%" if d else "—"


async def main() -> None:
    c = await asyncpg.connect(**DB)

    reg_total = await c.fetchval("SELECT count(*) FROM medical_images")
    owned = await c.fetchval("SELECT count(*) FROM medical_images WHERE asset_url IS NOT NULL")
    servable = await c.fetchval("SELECT count(*) FROM medical_images WHERE found AND servable")

    primary = await c.fetchval("SELECT COALESCE(sum(count),0) FROM image_request_stats WHERE path='primary'")
    fallback = await c.fetchval("SELECT COALESCE(sum(count),0) FROM image_request_stats WHERE path='fallback'")
    failures = await c.fetchval("SELECT COALESCE(sum(count),0) FROM image_request_stats WHERE status='failure'")
    fb_reasons = await c.fetch(
        "SELECT fallback_reason, sum(count) n FROM image_request_stats WHERE path='fallback' "
        "GROUP BY fallback_reason ORDER BY n DESC"
    )

    served = await c.fetchval("SELECT COALESCE(sum(count),0) FROM image_resolution_stats WHERE outcome='served'")
    no_image = await c.fetchval("SELECT COALESCE(sum(count),0) FROM image_resolution_stats WHERE outcome='no_image'")
    top_missing = await c.fetch(
        "SELECT concept, sum(count) n FROM image_resolution_stats WHERE outcome='no_image' "
        "GROUP BY concept ORDER BY n DESC LIMIT 15"
    )
    gaps = await c.fetch("SELECT sample, count, last_seen FROM coverage_gaps ORDER BY count DESC LIMIT 25")
    await c.close()

    print("=" * 60)
    print("ABOY IMAGE RELIABILITY + COVERAGE REPORT")
    print("=" * 60)
    print(f"\nRegistry: {reg_total} concepts | owned assets {owned} ({pct(owned, reg_total)}) | servable {servable}")

    print(f"\nServing  ({primary + fallback} byte requests)")
    print(f"  primary (owned)   : {primary} ({pct(primary, primary + fallback)})")
    print(f"  fallback (proxy)  : {fallback} ({pct(fallback, primary + fallback)})")
    print(f"  failures          : {failures}")
    for r in fb_reasons:
        print(f"     - {r['fallback_reason'] or '?'}: {r['n']}")

    print(f"\nResolution  (visual queries)")
    print(f"  attach rate       : {pct(served, served + no_image)}  (served {served} / no_image {no_image})")
    if top_missing:
        print("  top missing concepts:")
        for r in top_missing:
            print(f"     - {r['concept']}: {r['n']}")

    print(f"\nCoverage gaps  (visual intent, no concept) — curation backlog")
    if not gaps:
        print("  (none yet)")
    for r in gaps:
        print(f"  [{r['count']}x] {r['sample'][:80]}")


if __name__ == "__main__":
    asyncio.run(main())
