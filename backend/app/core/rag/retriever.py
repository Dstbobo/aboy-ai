from app.config import get_settings
from app.db.supabase import get_db


async def retrieve_chunks(query_embedding: list[float]) -> list[dict]:
    settings = get_settings()
    db = await get_db()

    result = await db.rpc(
        "match_knowledge_chunks",
        {
            "query_embedding": query_embedding,
            "match_threshold": settings.similarity_threshold,
            "match_count": settings.retrieval_top_k,
        },
    ).execute()

    return result.data or []
