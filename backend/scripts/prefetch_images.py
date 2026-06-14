"""One-off / re-runnable: pre-fetch every detector concept's medical image and
store it in the medical_images table so request-time lookups are instant.

Usage:  python -m scripts.prefetch_images
"""
import asyncio
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.core.media.image_search import all_prefetch_concepts, _live_lookup, _db_put  # noqa: E402


async def one(concept: str, sem: asyncio.Semaphore) -> tuple[str, bool]:
    async with sem:
        try:
            img = await _live_lookup(concept)
        except Exception:
            img = None
        await _db_put(concept, img)
        return concept, bool(img)


async def main() -> None:
    concepts = all_prefetch_concepts()
    sem = asyncio.Semaphore(6)
    results = await asyncio.gather(*(one(c, sem) for c in concepts))
    hits = [c for c, ok in results if ok]
    misses = [c for c, ok in results if not ok]
    print(f"prefetched {len(hits)}/{len(results)} concepts with an image")
    if misses:
        print("no image found for:")
        for m in misses:
            print("  -", m)


if __name__ == "__main__":
    asyncio.run(main())
