"""
Conversation history — reads the durable record already written to
query_audit_log (every query+response is logged there in real time) and
exposes it as sessions the app can list, open and continue.
"""
from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/history/sessions")
async def list_sessions(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    """One entry per conversation: id, title (first question), date, count."""
    db = await get_db()
    res = (
        await db.table("query_audit_log")
        .select("session_id, query_raw, created_at")
        .eq("user_id", user.user_id)
        .order("created_at", desc=False)
        .limit(500)
        .execute()
    )
    rows = res.data or []

    sessions: dict[str, dict] = {}
    for r in rows:
        sid = r.get("session_id")
        if not sid:
            continue
        if sid not in sessions:
            sessions[sid] = {
                "session_id": sid,
                "title": (r.get("query_raw") or "New conversation")[:80],
                "created_at": r.get("created_at"),
                "updated_at": r.get("created_at"),
                "message_count": 0,
            }
        sessions[sid]["updated_at"] = r.get("created_at")
        sessions[sid]["message_count"] += 1

    # Newest activity first.
    return sorted(sessions.values(), key=lambda s: s["updated_at"] or "", reverse=True)


@router.get("/history/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Full ordered transcript for one conversation."""
    db = await get_db()
    res = (
        await db.table("query_audit_log")
        .select("query_raw, response_text, sources_cited, created_at")
        .eq("user_id", user.user_id)
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    rows = res.data or []

    messages: list[dict] = []
    for r in rows:
        ts = r.get("created_at")
        if r.get("query_raw"):
            messages.append({"role": "user", "content": r["query_raw"], "citations": [], "created_at": ts})
        if r.get("response_text"):
            messages.append({
                "role": "assistant",
                "content": r["response_text"],
                "citations": r.get("sources_cited") or [],
                "created_at": ts,
            })

    return {"session_id": session_id, "messages": messages}
