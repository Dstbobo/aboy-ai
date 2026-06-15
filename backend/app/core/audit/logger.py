import logging

from app.core.audit.models import AuditEvent
from app.db.supabase import get_db

logger = logging.getLogger(__name__)


async def log_query(event: AuditEvent) -> None:
    db = await get_db()

    # The session row MUST exist first: query_audit_log.session_id has a
    # foreign key to query_sessions(id). Without this upsert every audit
    # insert fails (23503) and no history is ever saved.
    try:
        await db.table("query_sessions").upsert({
            "id": event.session_id,
            "user_id": event.user_id,
            "last_query_at": "now()",
            "is_active": True,
        }).execute()
    except Exception as exc:
        logger.error("Session upsert failed: %s", exc)

    try:
        data = event.model_dump()
        if not data.get("id"):
            data.pop("id", None)  # let the DB generate one
        await db.table("query_audit_log").insert(data).execute()
    except Exception as exc:
        # Audit failure must never surface to the user — log and continue
        logger.error("Audit log write failed: %s", exc)
