from functools import lru_cache

from tavily import AsyncTavilyClient

from app.config import get_settings
from app.core.cache import cache_get, cache_set, query_hash, TTL_TAVILY


@lru_cache
def _get_tavily_client() -> AsyncTavilyClient:
    # Singleton client — connection pool reused across requests.
    return AsyncTavilyClient(api_key=get_settings().tavily_api_key)


async def web_search(query: str) -> list[dict]:
    # Tavily cache (2h) — skip the web call on a hit.
    key = f"web:{query_hash(query)}"
    cached = await cache_get(key)
    if cached is not None:
        return cached

    settings = get_settings()
    client = _get_tavily_client()
    try:
        response = await client.search(
            query=query,
            search_depth="advanced",
            include_domains=settings.tavily_include_domains,
            max_results=5,
        )
        results = response.get("results", [])
    except Exception:
        return []

    await cache_set(key, results, TTL_TAVILY)
    return results
