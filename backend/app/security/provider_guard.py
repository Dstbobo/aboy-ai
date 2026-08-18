from fastapi import HTTPException, status

from app.config import get_settings
from app.core.cache import sliding_window_allow
from app.models.user import AuthenticatedUser


async def enforce_provider_request(
    user: AuthenticatedUser,
    *,
    text_chars: int = 0,
    request_bytes: int = 0,
) -> None:
    """Apply shared size and spend-rate controls before any paid provider call."""
    settings = get_settings()
    if text_chars < 0 or text_chars > settings.provider_max_text_chars:
        raise HTTPException(status_code=413, detail="Request text is too large")
    if request_bytes < 0 or request_bytes > settings.provider_max_upload_bytes:
        raise HTTPException(status_code=413, detail="Uploaded content is too large")

    user_allowed, _ = await sliding_window_allow(
        f"provider:user:{user.user_id}", settings.provider_user_requests_per_minute, 60
    )
    if not user_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many AI requests. Please try again shortly.",
            headers={"Retry-After": "60"},
        )

    global_allowed, _ = await sliding_window_allow(
        "provider:global", settings.provider_global_requests_per_minute, 60
    )
    if not global_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI service is busy. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
