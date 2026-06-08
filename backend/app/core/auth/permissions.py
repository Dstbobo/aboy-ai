from app.models.user import AuthenticatedUser

CLINICAL_ROLES = {
    "admin", "educator",
    "pro_senior", "pro_junior", "pro_nurse",
    "student_med", "student_nurse", "student_allied",
}

STUDENT_ROLES = {"student_med", "student_nurse", "student_allied"}

PRO_ROLES = {"pro_senior", "pro_junior", "pro_nurse"}

ADMIN_ROLES = {"admin"}


def is_student(user: AuthenticatedUser) -> bool:
    return user.role in STUDENT_ROLES


def is_pro(user: AuthenticatedUser) -> bool:
    return user.role in PRO_ROLES


def is_admin(user: AuthenticatedUser) -> bool:
    return user.role in ADMIN_ROLES


def can_access_clinical(user: AuthenticatedUser) -> bool:
    return user.role in CLINICAL_ROLES


def require_admin(user: AuthenticatedUser) -> None:
    if not is_admin(user):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
