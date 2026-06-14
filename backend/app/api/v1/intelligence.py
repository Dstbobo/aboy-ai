from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.core.intelligence.profile import get_raw_profile
from app.core.intelligence.welcome import build_welcome
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


async def _display_name(user: AuthenticatedUser) -> str:
    # Prefer the profile's full name; fall back to the email local-part.
    try:
        db = await get_db()
        res = await db.table("user_profiles").select("full_name").eq("id", user.user_id).maybe_single().execute()
        if res and res.data and res.data.get("full_name"):
            return str(res.data["full_name"]).split(" ")[0]
    except Exception:
        pass
    return (user.email or "there").split("@")[0]


@router.get("/intelligence/profile")
async def intelligence_profile(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    profile = await get_raw_profile(user.user_id)
    return profile or {"user_id": user.user_id, "role": user.role, "total_queries": 0, "current_streak": 0}


@router.get("/intelligence/welcome")
async def intelligence_welcome(
    hour: int | None = None,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    profile = await get_raw_profile(user.user_id)
    name = await _display_name(user)
    h = hour if hour is not None and 0 <= hour <= 23 else datetime.now(timezone.utc).hour
    return build_welcome(profile, name, user.role, h)
