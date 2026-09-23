from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, Depends

from app.core.auth.middleware import get_current_user
from app.db.supabase import get_db
from app.models.user import AuthenticatedUser

router = APIRouter()


class PushTokenRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=16, max_length=4096)


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
