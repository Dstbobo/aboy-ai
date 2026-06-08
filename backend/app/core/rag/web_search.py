from tavily import AsyncTavilyClient

from app.config import get_settings


async def web_search(query: str) -> list[dict]:
    settings = get_settings()
    client = AsyncTavilyClient(api_key=settings.tavily_api_key)

    try:
        response = await client.search(
            query=query,
            search_depth="advanced",
            include_domains=settings.tavily_include_domains,
            max_results=5,
        )
        return response.get("results", [])
    except Exception:
        return []
