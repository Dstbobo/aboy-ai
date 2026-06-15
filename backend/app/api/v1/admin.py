from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.core.auth.permissions import require_admin
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/users")
async def list_users(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    require_admin(user)
    db = await get_db()
    result = await db.table("user_profiles").select("*").order("created_at", desc=True).execute()
    return result.data or []


@router.get("/feedback")
async def feedback_report(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    """Quality signal: vote totals + recent dislikes with their answer context."""
    require_admin(user)
    db = await get_db()
    votes = (await db.table("query_feedback").select("rating, audit_log_id, feedback_text, created_at")
             .order("created_at", desc=True).limit(500).execute()).data or []
    up = sum(1 for v in votes if (v.get("rating") or 0) >= 4)
    down = sum(1 for v in votes if (v.get("rating") or 0) <= 2)

    # Hydrate recent dislikes with the question + model so they're actionable.
    recent_down = [v for v in votes if (v.get("rating") or 0) <= 2][:25]
    items = []
    for v in recent_down:
        ctx = (await db.table("query_audit_log").select("query_raw, model_used")
               .eq("id", v["audit_log_id"]).limit(1).execute()).data
        q = (ctx[0]["query_raw"] if ctx else "")[:160]
        items.append({
            "audit_id": v["audit_log_id"], "question": q,
            "model": ctx[0]["model_used"] if ctx else None,
            "comment": v.get("feedback_text"), "at": v.get("created_at"),
        })
    total = up + down
    return {
        "up": up, "down": down, "total": total,
        "satisfaction_pct": round(100 * up / total, 1) if total else None,
        "recent_dislikes": items,
    }


@router.get("/funnel")
async def funnel_report(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    """Activation funnel: signups + client step events + first-question conversion."""
    require_admin(user)
    db = await get_db()
    signups = len((await db.table("user_profiles").select("id").execute()).data or [])
    asked = len({r["user_id"] for r in (await db.table("query_audit_log").select("user_id").execute()).data or []})
    steps = (await db.table("funnel_events").select("step, count").execute()).data or []
    by_step: dict[str, int] = {}
    for s in steps:
        by_step[s["step"]] = by_step.get(s["step"], 0) + s["count"]

    def pct(n: int) -> float:
        return round(100 * n / signups, 1) if signups else 0.0

    return {
        "signups": signups,
        "asked_first_question_users": asked,
        "activation_rate_pct": pct(asked),
        "step_events": by_step,
    }


@router.get("/image-stats")
async def image_stats(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    """Image reliability + coverage report (drives ongoing curation)."""
    require_admin(user)
    db = await get_db()

    # Byte-serving reliability (from the /img resolution endpoint).
    serve = (await db.table("image_request_stats").select("path, fallback_reason, status, count").execute()).data or []
    primary = sum(r["count"] for r in serve if r["path"] == "primary")
    fallback = sum(r["count"] for r in serve if r["path"] == "fallback")
    failures = sum(r["count"] for r in serve if r["status"] == "failure")
    total_serve = primary + fallback
    fb_reasons: dict[str, int] = {}
    for r in serve:
        if r["path"] == "fallback":
            fb_reasons[r["fallback_reason"] or "?"] = fb_reasons.get(r["fallback_reason"] or "?", 0) + r["count"]

    # Resolution outcomes (did a visual query get an image?).
    res = (await db.table("image_resolution_stats").select("concept, outcome, count").execute()).data or []
    served = sum(r["count"] for r in res if r["outcome"] == "served")
    no_image = sum(r["count"] for r in res if r["outcome"] == "no_image")
    miss_by_concept: dict[str, int] = {}
    for r in res:
        if r["outcome"] == "no_image":
            miss_by_concept[r["concept"]] = miss_by_concept.get(r["concept"], 0) + r["count"]
    top_no_image = sorted(miss_by_concept.items(), key=lambda x: x[1], reverse=True)[:15]

    # Coverage gaps (visual-intent queries with no concept).
    gaps = (await db.table("coverage_gaps").select("sample, count, last_seen")
            .order("count", desc=True).limit(25).execute()).data or []

    # Asset ownership of the registry.
    reg = (await db.table("medical_images").select("found, servable, asset_url").execute()).data or []
    owned = sum(1 for r in reg if r.get("asset_url"))
    servable = sum(1 for r in reg if r.get("found") and r.get("servable") is not False)

    def pct(n: int, d: int) -> float:
        return round(100 * n / d, 1) if d else 0.0

    return {
        "serving": {
            "primary": primary, "fallback": fallback, "failures": failures,
            "primary_rate_pct": pct(primary, total_serve),
            "fallback_rate_pct": pct(fallback, total_serve),
            "fallback_reasons": fb_reasons,
        },
        "resolution": {
            "served": served, "no_image": no_image,
            "attach_rate_pct": pct(served, served + no_image),
            "top_missing_concepts": top_no_image,
        },
        "registry": {
            "total": len(reg), "owned_assets": owned, "servable": servable,
            "owned_pct": pct(owned, len(reg)),
        },
        "coverage_gaps": gaps,
    }


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    role: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    require_admin(user)
    db = await get_db()
    await db.table("user_profiles").update({"role": role}).eq("user_id", user_id).execute()
    return {"status": "updated"}
