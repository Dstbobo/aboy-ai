import logging

from app.core.audit.models import AuditEvent
from app.db.supabase import get_db

logger = logging.getLogger(__name__)


async def log_query(event: AuditEvent) -> None:
    try:
        db = await get_db()
        await db.table("query_audit_log").insert(event.model_dump()).execute()
    except Exception as exc:
        # Audit failure must never surface to the user — log and continue
        logger.error("Audit log write failed: %s", exc)
