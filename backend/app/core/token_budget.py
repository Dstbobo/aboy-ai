"""
Beta token budget — fixed daily allowance per user, tracked in Supabase.
Designed to flip to monthly later via the platform_settings 'token_limit_mode' flag.
"""
import logging
import time
from datetime import date

from app.core.dev_accounts import is_unlimited
from app.db.supabase import get_db

logger = logging.getLogger(__name__)

DEFAULT_DAILY_LIMIT = 100000
LIMIT_MESSAGE = "You have reached your daily limit. Come back tomorrow to continue learning."
_USAGE_WRITE_COOLDOWN_SECONDS = 300
_usage_write_blocked_until: dict[str, float] = {}


class UsageUnavailableError(RuntimeError):
    """Token-budget state could not be proven; provider use must fail closed."""


async def _get_settings(db) -> tuple[str, int]:
    mode, limit = "daily", DEFAULT_DAILY_LIMIT
    try:
        res = await db.table("platform_settings").select("key, value").in_(
            "key", ["token_limit_mode", "daily_token_limit"]
        ).execute()
        for row in (res.data or []):
            if row["key"] == "token_limit_mode":
                mode = row["value"]
            elif row["key"] == "daily_token_limit":
                limit = int(row["value"])
    except Exception:
        raise UsageUnavailableError("Token budget settings are unavailable") from None
    if mode not in {"daily", "monthly"} or limit <= 0:
        raise UsageUnavailableError("Token budget settings are invalid")
    return mode, limit


def _period_start(mode: str) -> str:
    today = date.today()
    if mode == "monthly":
        return today.replace(day=1).isoformat()
    return today.isoformat()


async def get_usage(user_id: str) -> dict:
    """Returns {used, limit, mode, remaining, resets_at}."""
    if is_unlimited(user_id=user_id):
        return {"used": 0, "limit": -1, "remaining": -1, "mode": "unlimited",
                "resets_at": "never", "unlimited": True}
    try:
        db = await get_db()
        mode, limit = await _get_settings(db)
        q = db.table("user_token_usage").select("tokens_used").eq("user_id", user_id)
        if mode == "monthly":
            q = q.gte("usage_date", _period_start(mode))
        else:
            q = q.eq("usage_date", _period_start(mode))
        res = await q.execute()
        used = sum(r["tokens_used"] for r in (res.data or []))
    except Exception:
        raise UsageUnavailableError("Token usage is unavailable") from None

    resets_at = "the 1st of next month (UTC)" if mode == "monthly" else "midnight UTC"
    return {
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
        "mode": mode,
        "resets_at": resets_at,
    }


async def is_exhausted(user_id: str) -> bool:
    if is_unlimited(user_id=user_id):
        return False
    blocked_until = _usage_write_blocked_until.get(user_id, 0)
    if blocked_until > time.monotonic():
        return True
    _usage_write_blocked_until.pop(user_id, None)
    usage = await get_usage(user_id)
    return usage["used"] >= usage["limit"]


async def add_usage(user_id: str, tokens: int) -> None:
    if tokens <= 0 or is_unlimited(user_id=user_id):
        return
    try:
        db = await get_db()
        _, limit = await _get_settings(db)
        await db.rpc(
            "add_token_usage",
            {"p_user": user_id, "p_tokens": int(tokens), "p_limit": limit},
        ).execute()
        _usage_write_blocked_until.pop(user_id, None)
    except Exception:
        _usage_write_blocked_until[user_id] = time.monotonic() + _USAGE_WRITE_COOLDOWN_SECONDS
        logger.error("token usage write failed; user temporarily blocked")
