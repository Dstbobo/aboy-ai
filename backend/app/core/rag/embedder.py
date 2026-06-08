from functools import lru_cache

import voyageai

from app.config import get_settings


@lru_cache
def _get_voyage_client() -> voyageai.AsyncClient:
    return voyageai.AsyncClient(api_key=get_settings().voyage_api_key)


async def embed_query(text: str) -> list[float]:
    client = _get_voyage_client()
    settings = get_settings()
    result = await client.embed([text], model=settings.voyage_model, input_type="query")
    return result.embeddings[0]


async def embed_documents(texts: list[str]) -> list[list[float]]:
    client = _get_voyage_client()
    settings = get_settings()
    result = await client.embed(texts, model=settings.voyage_model, input_type="document")
    return result.embeddings
