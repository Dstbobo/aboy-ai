from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.models.user import AuthenticatedUser

router = APIRouter()


@router.get("/me")
async def me(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    return {"user_id": user.user_id, "email": user.email, "role": user.role}
