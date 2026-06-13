from functools import lru_cache

import voyageai

from app.config import get_settings
from app.core.cache import cache_get, cache_set, query_hash, TTL_EMBEDDING


@lru_cache
def _get_voyage_client() -> voyageai.AsyncClient:
    # Singleton — the SDK keeps its own keep-alive httpx pool, reused via lru_cache.
    return voyageai.AsyncClient(api_key=get_settings().voyage_api_key)


async def embed_query(text: str) -> list[float]:
    # Embedding cache (7d) — skip the Voyage call on a hit.
    key = f"emb:{query_hash(text)}"
    cached = await cache_get(key)
    if cached:
        return cached

    client = _get_voyage_client()
    settings = get_settings()
    result = await client.embed([text], model=settings.voyage_model, input_type="query")
    vec = result.embeddings[0]
    await cache_set(key, vec, TTL_EMBEDDING)
    return vec


async def embed_documents(texts: list[str]) -> list[list[float]]:
    client = _get_voyage_client()
    settings = get_settings()
    result = await client.embed(texts, model=settings.voyage_model, input_type="document")
    return result.embeddings
