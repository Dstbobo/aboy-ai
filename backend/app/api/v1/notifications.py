from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


class PushTokenRegister(BaseModel):
    token: str


@router.post("/notifications/register")
async def register_push_token(
    body: PushTokenRegister,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    db = await get_db()
    await db.table("user_profiles").update({
        "push_token": body.token,
    }).eq("id", user.user_id).execute()
    return {"status": "registered"}
