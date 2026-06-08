from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.core.auth.permissions import require_admin
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/audit")
async def get_audit_logs(
    limit: int = 50,
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    require_admin(user)
    db = await get_db()
    result = (
        await db.table("query_audit_log")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []
