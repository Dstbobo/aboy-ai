from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


class FeedbackCreate(BaseModel):
    audit_log_id: str
    rating: int | None = None
    accuracy_rating: int | None = None
    feedback_text: str | None = None
    feedback_tags: list[str] = []


class RateBody(BaseModel):
    session_id: str
    rating: str  # 'up' | 'down'


@router.post("/feedback/rate")
async def rate(body: RateBody, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    """Thumbs up/down on the latest answer in a session (Like/Dislike buttons)."""
    db = await get_db()
    # Find the most recent audit row for this session to anchor the feedback.
    res = (
        await db.table("query_audit_log").select("id, query_raw")
        .eq("user_id", user.user_id).eq("session_id", body.session_id)
        .order("created_at", desc=True).limit(1).execute()
    )
    if not res.data:
        return {"status": "no_target"}
    audit_id = res.data[0]["id"]
    is_down = body.rating == "down"
    try:
        await db.table("query_feedback").insert({
            "audit_log_id": audit_id,
            "user_id": user.user_id,
            "rating": 1 if is_down else 5,
            "feedback_tags": ["flagged_for_review"] if is_down else ["liked"],
        }).execute()
    except Exception:
        return {"status": "error"}

    # Feed the like/dislike into the learning profile's topic tallies.
    try:
        from app.core.intelligence.topics import extract_topics
        col = "disliked" if is_down else "liked"
        for topic in extract_topics(res.data[0].get("query_raw") or "", user.role):
            await db.rpc("bump_topic_feedback", {"p_user": user.user_id, "p_topic": topic, "p_col": col}).execute()
    except Exception:
        pass
    return {"status": "submitted"}


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackCreate,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    db = await get_db()
    await db.table("query_feedback").insert({
        "audit_log_id": body.audit_log_id,
        "user_id": user.user_id,
        "rating": body.rating,
        "accuracy_rating": body.accuracy_rating,
        "feedback_text": body.feedback_text,
        "feedback_tags": body.feedback_tags,
    }).execute()
    return {"status": "submitted"}
