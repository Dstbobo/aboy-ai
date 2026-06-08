"""
Supabase async client — singleton pattern via module-level variable.
The async client must be created with `await create_client(...)`.
"""
from supabase._async.client import AsyncClient, create_client

from app.config import get_settings

_client: AsyncClient | None = None


async def get_db() -> AsyncClient:
    """Return the singleton async Supabase client (service role)."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = await create_client(settings.supabase_url, settings.supabase_service_key)
    return _client
