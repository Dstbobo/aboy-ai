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
    profile = (result.data if result else None) or {}

    # Attach any pending role-change request so the app can show its status.
    try:
        pending = (
            await db.table("role_change_requests")
            .select("id, to_role, to_sub_role, status, created_at")
            .eq("user_id", user.user_id)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        profile["pending_role_request"] = pending.data[0] if pending and pending.data else None
    except Exception:
        profile["pending_role_request"] = None

    return profile


class RoleChangeRequest(BaseModel):
    to_role: str
    to_sub_role: str | None = None


@router.post("/profile/role-change")
async def request_role_change(
    body: RoleChangeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Role changes are reviewed by an admin — not applied instantly."""
    db = await get_db()
    await db.table("role_change_requests").insert({
        "user_id": user.user_id,
        "from_role": user.role,
        "to_role": body.to_role,
        "to_sub_role": body.to_sub_role,
        "status": "pending",
    }).execute()
    return {"status": "pending", "detail": "Role change submitted for admin review."}


@router.post("/profile/role-change/{request_id}/review")
async def review_role_change(
    request_id: str,
    approve: bool = True,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Admin approves/rejects a role change; approval applies the new role."""
    if user.role != "admin":
        return {"status": "forbidden"}
    db = await get_db()
    req = (
        await db.table("role_change_requests").select("*").eq("id", request_id).maybe_single().execute()
    )
    if not req or not req.data:
        return {"status": "not_found"}
    new_status = "approved" if approve else "rejected"
    await db.table("role_change_requests").update({
        "status": new_status,
        "reviewed_by": user.user_id,
        "reviewed_at": "now()",
    }).eq("id", request_id).execute()
    if approve:
        await db.table("user_profiles").update({
            "role": req.data["to_role"],
            "sub_role": req.data.get("to_sub_role"),
            "updated_at": "now()",
        }).eq("id", req.data["user_id"]).execute()
    return {"status": new_status}
