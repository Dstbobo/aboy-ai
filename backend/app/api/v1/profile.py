from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


class ProfileUpdate(BaseModel):
    role: str | None = None
    sub_role: str | None = None
    full_name: str | None = None
    specialty: str | None = None
    institution: str | None = None
    country_code: str | None = None
    graduation_year: int | None = None


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    db = await get_db()

    update_data: dict = {}
    if body.role is not None:
        update_data["role"] = body.role
    if body.sub_role is not None:
        update_data["sub_role"] = body.sub_role
    if body.full_name is not None:
        update_data["full_name"] = body.full_name
    if body.specialty is not None:
        update_data["specialty"] = body.specialty
    if body.institution is not None:
        update_data["institution"] = body.institution
    if body.country_code is not None:
        update_data["country_code"] = body.country_code
    if body.graduation_year is not None:
        update_data["graduation_year"] = body.graduation_year

    if update_data:
        update_data["updated_at"] = "now()"
        await db.table("user_profiles").update(update_data).eq("id", user.user_id).execute()

    return {"status": "updated"}


@router.get("/profile")
async def get_profile(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    db = await get_db()
    result = await db.table("user_profiles").select("*").eq("id", user.user_id).maybe_single().execute()
    return result.data or {}
