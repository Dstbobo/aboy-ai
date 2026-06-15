"""Lightweight client activation-funnel events (compact per-day counters)."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser
from app.utils.background import fire_and_forget

router = APIRouter()

# Allow-list so the endpoint can't be used to write arbitrary step names.
_ALLOWED_STEPS = {
    "onboarding_started", "onboarding_complete", "welcome_shown",
    "starter_tapped", "first_question",
}


class EventBody(BaseModel):
    step: str


async def _bump(step: str) -> None:
    try:
        db = await get_db()
        await db.rpc("bump_funnel_event", {"p_step": step}).execute()
    except Exception:
        pass


@router.post("/events")
async def record_event(body: EventBody, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    if body.step in _ALLOWED_STEPS:
        fire_and_forget(_bump(body.step))
    return {"status": "ok"}
