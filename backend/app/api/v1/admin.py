from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.core.auth.permissions import require_admin
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/users")
async def list_users(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    require_admin(user)
    db = await get_db()
    result = await db.table("user_profiles").select("*").order("created_at", desc=True).execute()
    return result.data or []


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    role: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    require_admin(user)
    db = await get_db()
    await db.table("user_profiles").update({"role": role}).eq("user_id", user_id).execute()
    return {"status": "updated"}
