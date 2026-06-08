from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.core.auth.permissions import require_admin
from app.db.supabase import get_db
from app.models.knowledge import KnowledgeSourceCreate, KnowledgeSourceResponse
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/knowledge", response_model=list[KnowledgeSourceResponse])
async def list_knowledge_sources(
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    require_admin(user)
    db = await get_db()
    result = await db.table("knowledge_sources").select("*").order("created_at", desc=True).execute()
    return result.data or []


@router.post("/knowledge", response_model=KnowledgeSourceResponse)
async def add_knowledge_source(
    body: KnowledgeSourceCreate,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    require_admin(user)
    db = await get_db()
    result = await db.table("knowledge_sources").insert({
        **body.model_dump(),
        "added_by": user.user_id,
    }).execute()
    return result.data[0]
