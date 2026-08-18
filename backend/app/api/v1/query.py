import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import get_settings
from app.core.auth.middleware import get_current_user
from app.core.rag.pipeline import run_rag_pipeline
from app.models.query import QueryRequest, QueryResponse
from app.models.user import AuthenticatedUser
from app.security.provider_guard import enforce_provider_request
from app.utils.rate_limiter import check_rate_limit

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/query", response_model=QueryResponse)
async def query(
    request: Request,
    body: QueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> QueryResponse:
    await check_rate_limit(user)
    text_chars = len(body.query) + sum(len(turn.content) for turn in (body.history or []))
    await enforce_provider_request(user, text_chars=text_chars)

    session_id = str(body.session_id) if body.session_id else str(uuid.uuid4())
    client_ip = request.client.host if request.client else None

    try:
        return await asyncio.wait_for(
            run_rag_pipeline(body, user, client_ip, session_id),
            timeout=get_settings().provider_timeout_seconds,
        )
    except TimeoutError:
        raise HTTPException(status_code=504, detail="AI request timed out") from None
    except HTTPException:
        raise
    except Exception:
        logger.warning("query provider request failed")
        raise HTTPException(status_code=502, detail="Could not generate an answer") from None
