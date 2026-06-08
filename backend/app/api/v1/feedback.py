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
