from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.config import get_settings
from app.core.auth.middleware import get_current_user
from app.core.auth.permissions import require_admin
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser
from app.utils.background import fire_and_forget

router = APIRouter()


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audit_log_id: str = Field(min_length=1, max_length=64)
    rating: int | None = Field(default=None, ge=1, le=5)
    accuracy_rating: int | None = Field(default=None, ge=1, le=5)
    feedback_text: str | None = Field(default=None, max_length=1000)
    feedback_tags: list[str] = Field(default_factory=list, max_length=10)


class RateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: Literal["up", "down"]
    audit_id: str | None = Field(default=None, max_length=64)
    session_id: str | None = Field(default=None, max_length=64)
    comment: str | None = Field(default=None, max_length=1000)


async def _notify_discord(audit_id: str, model: str, comment: str) -> None:
    """Alert on actionable dislikes (those with a comment). No question/answer
    content is sent — only the user's note + a reference id to look up safely."""
    settings = get_settings()
    url = settings.discord_feedback_webhook
    if not settings.discord_feedback_enabled or not url:
        return
    try:
        msg = (
            f":thumbsdown: **Disliked answer**\n"
            f"• model: `{model or 'unknown'}`\n"
            f"• answer id: `{audit_id}`\n"
            f"• note: {comment[:500]}"
        )
        async with httpx.AsyncClient(timeout=8) as c:
            await c.post(url, json={"content": msg})
    except Exception:
        pass


class AppFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1500)
    category: Literal["bug", "idea", "general"] = "general"


async def _notify_app_feedback(category: str, message: str) -> None:
    """Send a tester's free-text feedback straight to the Discord webhook so the
    founder sees it instantly."""
    settings = get_settings()
    url = settings.discord_feedback_webhook
    if not settings.discord_feedback_enabled or not url:
        return
    try:
        msg = (
            f":speech_balloon: **Tester feedback** ({category})\n"
            f"• {message[:1500]}"
        )
        async with httpx.AsyncClient(timeout=8) as c:
            await c.post(url, json={"content": msg})
    except Exception:
        pass


@router.post("/feedback/app")
async def app_feedback(
    body: AppFeedback,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """General in-app feedback (not tied to a specific answer). Pings Discord and
    best-effort stores in `app_feedback` if that table exists."""
    fire_and_forget(_notify_app_feedback(body.category, body.message))
    try:
        db = await get_db()
        await db.table("app_feedback").insert({
            "user_id": user.user_id, "category": body.category, "message": body.message,
        }).execute()
    except Exception:
        pass
    return {"status": "submitted"}


@router.get("/feedback/app/list")
async def list_app_feedback(
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    """Recent in-app feedback — readable through the audited admin role only."""
    require_admin(user)
    db = await get_db()
    res = (
        await db.table("app_feedback")
        .select("id, category, message, created_at")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []


@router.post("/feedback/rate")
async def rate(body: RateBody, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    """Thumbs up/down on a specific answer. Upsert: one vote per (user, answer)."""
    db = await get_db()

    audit_id = body.audit_id
    query_raw, model = "", ""
    if audit_id:
        res = await db.table("query_audit_log").select("query_raw, model_used") \
            .eq("id", audit_id).eq("user_id", user.user_id).limit(1).execute()
        if res.data:
            query_raw = res.data[0].get("query_raw") or ""
            model = res.data[0].get("model_used") or ""
        else:
            raise HTTPException(status_code=404, detail="Answer not found")
    else:
        # Fallback: most recent answer in the session.
        res = (
            await db.table("query_audit_log").select("id, query_raw, model_used")
            .eq("user_id", user.user_id).eq("session_id", body.session_id or "")
            .order("created_at", desc=True).limit(1).execute()
        )
        if not res.data:
            return {"status": "no_target"}
        audit_id = res.data[0]["id"]
        query_raw = res.data[0].get("query_raw") or ""
        model = res.data[0].get("model_used") or ""

    is_down = body.rating == "down"
    comment = (body.comment or "").strip()[:1000] or None
    try:
        await db.table("query_feedback").upsert({
            "audit_log_id": audit_id,
            "user_id": user.user_id,
            "rating": 1 if is_down else 5,
            "feedback_text": comment,
            "feedback_tags": ["flagged_for_review"] if is_down else ["liked"],
        }, on_conflict="user_id,audit_log_id").execute()
    except Exception:
        return {"status": "error"}

    # Feed the like/dislike into the learning profile's topic tallies.
    try:
        from app.core.intelligence.topics import extract_topics
        col = "disliked" if is_down else "liked"
        for topic in extract_topics(query_raw, user.role):
            await db.rpc("bump_topic_feedback", {"p_user": user.user_id, "p_topic": topic, "p_col": col}).execute()
    except Exception:
        pass

    # Discord only on actionable dislikes (those with a comment). No PII content.
    if is_down and comment:
        fire_and_forget(_notify_discord(audit_id, model, comment))

    return {"status": "submitted"}


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackCreate,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    db = await get_db()
    owned = (
        await db.table("query_audit_log")
        .select("id")
        .eq("id", body.audit_log_id)
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    if not owned.data:
        raise HTTPException(status_code=404, detail="Answer not found")
    await db.table("query_feedback").upsert({
        "audit_log_id": body.audit_log_id,
        "user_id": user.user_id,
        "rating": body.rating,
        "accuracy_rating": body.accuracy_rating,
        "feedback_text": body.feedback_text,
        "feedback_tags": body.feedback_tags,
    }, on_conflict="user_id,audit_log_id").execute()
    return {"status": "submitted"}
