import logging

from app.core.audit.models import AuditEvent
from app.db.supabase import get_db

logger = logging.getLogger(__name__)


async def log_query(event: AuditEvent) -> None:
    db = await get_db()
    if not event.session_id:
        logger.warning("audit session id missing")
        return

    # The service-role client bypasses RLS, so ownership must be checked before
    # accepting a client-generated conversation UUID. Never upsert across an
    # existing session because that could reassign another user's history.
    try:
        existing = (
            await db.table("query_sessions")
            .select("user_id")
            .eq("id", event.session_id)
            .maybe_single()
            .execute()
        )
        if existing and existing.data:
            if existing.data.get("user_id") != event.user_id:
                logger.warning("audit session ownership mismatch")
                return
            await db.table("query_sessions").update({
                "last_query_at": "now()",
                "is_active": True,
            }).eq("id", event.session_id).eq("user_id", event.user_id).execute()
        else:
            await db.table("query_sessions").insert({
                "id": event.session_id,
                "user_id": event.user_id,
                "last_query_at": "now()",
                "is_active": True,
            }).execute()
    except Exception:
        # A concurrent insert or database failure is re-checked once. Failure
        # remains fail-closed: no audit row is written without proven ownership.
        try:
            existing = (
                await db.table("query_sessions")
                .select("user_id")
                .eq("id", event.session_id)
                .maybe_single()
                .execute()
            )
            if not existing or not existing.data or existing.data.get("user_id") != event.user_id:
                logger.error("audit session ownership could not be established")
                return
        except Exception:
            logger.error("audit session ownership check failed")
            return

    try:
        data = event.model_dump()
        if not data.get("id"):
            data.pop("id", None)  # let the DB generate one
        await db.table("query_audit_log").insert(data).execute()
    except Exception:
        # Audit failure must never surface to the user — log and continue
        logger.error("audit log write failed")
