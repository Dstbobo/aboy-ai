from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    user_id: str
    email: str
    role: str
    sub_role: str | None = None
