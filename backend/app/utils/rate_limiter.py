import math
from datetime import date

from fastapi import HTTPException, status

from app.config import get_settings
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser


async def check_rate_limit(user: AuthenticatedUser) -> None:
    settings = get_settings()
    limit = settings.rate_limits.get(user.role, 50)

    if math.isinf(limit):
        return

    db = await get_db()
    today = date.today().isoformat()

    result = await db.table("rate_limit_counters").select("query_count, count_date").eq(
        "user_id", user.user_id
    ).maybe_single().execute()

    if result.data and result.data["count_date"] == today:
        if result.data["query_count"] >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Daily query limit of {int(limit)} reached. Upgrade for more.",
            )
        await db.table("rate_limit_counters").update({
            "query_count": result.data["query_count"] + 1,
            "updated_at": "now()",
        }).eq("user_id", user.user_id).execute()
    else:
        await db.table("rate_limit_counters").upsert({
            "user_id": user.user_id,
            "count_date": today,
            "query_count": 1,
            "updated_at": "now()",
        }).execute()
