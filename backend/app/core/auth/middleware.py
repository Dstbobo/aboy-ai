from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import Settings, get_settings
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

bearer_scheme = HTTPBearer()

# All valid role IDs — used as whitelist; unknown roles fall back to student_med
VALID_ROLES = {
    # Students
    "student_med", "student_nurse", "student_midwifery", "student_community_health",
    "student_pharmacy", "student_dental", "student_physio", "student_radiography",
    "student_med_lab", "student_biomedical", "student_optometry", "student_nutrition",
    "student_ot", "student_health_info", "student_env_health", "student_slt",
    # Professionals
    "pro_junior", "pro_senior", "pro_nurse", "pro_midwife", "pro_community_health",
    "pro_pharmacist", "pro_paramedic", "pro_public_health", "pro_dental", "pro_physio",
    "pro_radiographer", "pro_med_lab", "pro_optometrist", "pro_nutritionist",
    "pro_ot", "pro_health_info", "pro_env_health", "pro_slt",
    # System
    "educator", "admin",
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Supabase JWTs are signed with SUPABASE_JWT_SECRET (HS256)
        # Fall back to anon_key if jwt_secret not configured (dev/testing only)
        signing_key = settings.supabase_jwt_secret or settings.supabase_anon_key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        raise credentials_exception

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise credentials_exception

    # Role lives in app_metadata — never trust user_metadata
    app_metadata: dict = payload.get("app_metadata", {})
    role: str = app_metadata.get("role", "student_med")

    if role not in VALID_ROLES:
        role = "student_med"

    email: str = payload.get("email", "")

    # Fetch sub_role from user_profiles (non-fatal — sub_role is optional)
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
        if result.data:
            profile_role = result.data.get("role")
            if profile_role and profile_role in VALID_ROLES:
                role = profile_role
            sub_role = result.data.get("sub_role")
    except Exception:
        pass  # Non-fatal — fall back to JWT role, no sub_role

    return AuthenticatedUser(user_id=user_id, email=email, role=role, sub_role=sub_role)
