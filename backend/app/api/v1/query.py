import uuid

from fastapi import APIRouter, Depends, Request

from app.core.auth.middleware import get_current_user
from app.core.rag.pipeline import run_rag_pipeline
from app.models.query import QueryRequest, QueryResponse
from app.models.user import AuthenticatedUser
from app.utils.rate_limiter import check_rate_limit

router = APIRouter()


@router.post("/query", response_model=QueryResponse)
async def query(
    request: Request,
    body: QueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> QueryResponse:
    await check_rate_limit(user)

    session_id = body.session_id or str(uuid.uuid4())
    client_ip = request.client.host if request.client else None

    return await run_rag_pipeline(body, user, client_ip, session_id)
