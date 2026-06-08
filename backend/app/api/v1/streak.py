from datetime import date, timedelta

from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/streak")
async def get_streak(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    db = await get_db()

    result = await db.table("query_audit_log") \
        .select("created_at") \
        .eq("user_id", user.user_id) \
        .order("created_at", desc=True) \
        .limit(60) \
        .execute()

    if not result.data:
        return {"current_streak": 0, "longest_streak": 0, "today_count": 0}

    # Unique active days
    active_days = sorted(
        {row["created_at"][:10] for row in result.data},
        reverse=True,
    )

    today = date.today().isoformat()
    today_count = sum(1 for r in result.data if r["created_at"][:10] == today)

    # Calculate current streak
    streak = 0
    check = date.today()
    for day_str in active_days:
        if day_str == check.isoformat():
            streak += 1
            check -= timedelta(days=1)
        elif day_str < check.isoformat():
            break

    # Longest streak
    longest = 0
    run = 0
    prev = None
    for day_str in sorted(active_days):
        d = date.fromisoformat(day_str)
        if prev and (d - prev).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)
        prev = d

    return {
        "current_streak": streak,
        "longest_streak": longest,
        "today_count": today_count,
        "active_days": active_days[:30],
    }
