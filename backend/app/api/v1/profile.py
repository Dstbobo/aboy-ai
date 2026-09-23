from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth.middleware import get_current_user, is_valid_role
from app.core.token_budget import get_usage
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/usage")
async def usage(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    """Daily token budget status for the Settings 'Usage' section."""
    return await get_usage(user.user_id)


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, max_length=160)
    specialty: str | None = Field(default=None, max_length=160)
    institution: str | None = Field(default=None, max_length=240)
    country_code: str | None = Field(default=None, max_length=80)
    graduation_year: int | None = Field(default=None, ge=1900, le=2200)
    # Role-specific signup details (department, years_experience, job_title,
    # course, research_area, …) — flexible JSONB.
    details: dict | None = None


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    db = await get_db()

    update_data = body.model_dump(exclude_none=True)

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
    model_config = ConfigDict(extra="forbid")

    to_role: str = Field(min_length=3, max_length=64)
    to_sub_role: str | None = Field(default=None, max_length=160)


@router.post("/profile/role-change")
async def request_role_change(
    body: RoleChangeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Role changes are reviewed by an admin — not applied instantly."""
    if not is_valid_role(body.to_role) or body.to_role == "admin":
        raise HTTPException(status_code=400, detail="Requested role is not eligible")
    if body.to_role == user.role and body.to_sub_role == user.sub_role:
        raise HTTPException(status_code=409, detail="Role is unchanged")
    db = await get_db()
    pending = (
        await db.table("role_change_requests")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if pending and pending.data:
        raise HTTPException(status_code=409, detail="A role change is already pending")
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    db = await get_db()
    req = (
        await db.table("role_change_requests").select("*").eq("id", request_id).maybe_single().execute()
    )
    if not req or not req.data:
        raise HTTPException(status_code=404, detail="Role change request not found")
    if req.data.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Role change request is already final")
    if approve and (
        not is_valid_role(req.data.get("to_role", "")) or req.data["to_role"] == "admin"
    ):
        raise HTTPException(status_code=400, detail="Requested role is not eligible")
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
    await db.table("role_change_audit").insert({
        "request_id": request_id,
        "actor_user_id": user.user_id,
        "target_user_id": req.data["user_id"],
        "from_role": req.data["from_role"],
        "to_role": req.data["to_role"],
        "outcome": new_status,
    }).execute()
    return {"status": new_status}
