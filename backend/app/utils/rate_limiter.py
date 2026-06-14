import math

from fastapi import HTTPException, status

from app.config import get_settings
from app.core.cache import sliding_window_allow
from app.core.dev_accounts import is_unlimited
from app.models.user import AuthenticatedUser


async def check_rate_limit(user: AuthenticatedUser) -> None:
    """Redis sliding-window rate limit (24h). Faster than the DB and adds no DB load."""
    # Developer/test accounts are never rate limited.
    if is_unlimited(user_id=user.user_id, email=getattr(user, "email", None)):
        return
    settings = get_settings()
    limit = settings.rate_limits.get(user.role, 50)
    if math.isinf(limit):
        return

    allowed, count = await sliding_window_allow(user.user_id, int(limit), window_seconds=86400)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily query limit of {int(limit)} reached. Upgrade for more.",
        )
