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
