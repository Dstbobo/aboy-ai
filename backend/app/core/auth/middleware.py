import re

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

bearer_scheme = HTTPBearer()

# Roles are prefix-validated: 5 categories + system roles.
_SYSTEM_ROLES = {"admin", "educator"}
_ROLE_PATTERN = re.compile(r"^(?:student|pro|ops|edu|res)_[a-z0-9][a-z0-9_]{0,55}$")


def is_valid_role(role: str) -> bool:
    return role in _SYSTEM_ROLES or bool(_ROLE_PATTERN.fullmatch(role))


class _PrefixRoleSet:
    """Backwards-compatible membership object (`role in VALID_ROLES`)."""

    def __contains__(self, role: object) -> bool:
        return isinstance(role, str) and is_valid_role(role)


VALID_ROLES = _PrefixRoleSet()


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def authenticate_access_token(token: str) -> AuthenticatedUser:
    """Validate a Supabase access token and resolve server-controlled identity."""
    if not token or len(token) > 16_384:
        raise _credentials_exception()
    settings = get_settings()
    credentials_exception = _credentials_exception()

    # Validate the token directly against Supabase Auth REST API.
    # Works with ES256 and HS256 tokens — no JWT secret or python-jose needed.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
        if resp.status_code != 200:
            raise credentials_exception
        user_data = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise credentials_exception from None

    user_id: str = user_data.get("id", "")
    if not user_id:
        raise credentials_exception

    email: str = user_data.get("email", "")

    # Authorization role comes from the server-owned profile. If profile
    # lookup fails, default to a non-privileged role instead of preserving a
    # potentially stale admin claim from the token.
    role = "student_med"
    sub_role: str | None = None
    try:
        db = await get_db()
        result = (
            await db.table("user_profiles")
            .select("role, sub_role")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data:
            profile_role = result.data.get("role")
            if profile_role and profile_role in VALID_ROLES:
                role = profile_role
            sub_role = result.data.get("sub_role")
    except Exception:
        pass

    return AuthenticatedUser(user_id=user_id, email=email, role=role, sub_role=sub_role)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> AuthenticatedUser:
    return await authenticate_access_token(credentials.credentials)
