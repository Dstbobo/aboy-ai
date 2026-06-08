from functools import lru_cache

from supabase._async.client import AsyncClient, create_client

from app.config import get_settings


@lru_cache
def _get_service_client() -> AsyncClient:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)  # type: ignore[return-value]


async def get_db() -> AsyncClient:
    return _get_service_client()
