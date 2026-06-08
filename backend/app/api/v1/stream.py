import asyncio
import hashlib
import json
import time
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.auth.middleware import get_current_user
from app.core.audit.logger import log_query
from app.core.audit.models import AuditEvent
from app.core.llm.client import stream_response
from app.core.llm.prompts import build_user_prompt, get_system_prompt
from app.core.llm.safety import is_safe_output
from app.core.rag.context_builder import build_context
from app.core.rag.embedder import embed_query
from app.core.rag.pipeline import _build_citations
from app.core.rag.reranker import rerank_chunks
from app.core.rag.retriever import retrieve_chunks
from app.core.rag.web_search import web_search
from app.config import get_settings
from app.models.query import QueryRequest
from app.models.user import AuthenticatedUser
from app.utils.emergency import check_emergency
from app.utils.rate_limiter import check_rate_limit

router = APIRouter()


async def _event_generator(
    request: QueryRequest,
    user: AuthenticatedUser,
    client_ip: str | None,
    session_id: str,
):
    start = time.monotonic()
    settings = get_settings()
    emergency_triggered = check_emergency(request.query)

    query_embedding, web_results = await asyncio.gather(
        embed_query(request.query),
        web_search(request.query),
    )
    raw_chunks = await retrieve_chunks(query_embedding)
    reranked = rerank_chunks(raw_chunks)

    context = build_context(reranked, web_results)
    system_prompt = get_system_prompt(user.role, getattr(user, "sub_role", None))
    user_prompt = build_user_prompt(request.query, context)

    full_text = ""
    tokens_in = 0
    tokens_out = 0

    async for chunk in stream_response(system_prompt, user_prompt):
        if not is_safe_output(chunk):
            continue
        full_text += chunk
        tokens_out += len(chunk.split())
        yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"

    citations = _build_citations(reranked, web_results)
    meta = {
        "type": "meta",
        "citations": [c.model_dump() for c in citations],
        "emergency_triggered": emergency_triggered,
        "session_id": session_id,
    }
    yield f"data: {json.dumps(meta)}\n\n"
    yield "data: [DONE]\n\n"

    latency_ms = int((time.monotonic() - start) * 1000)
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest() if client_ip else None

    audit_event = AuditEvent(
        user_id=user.user_id,
        user_role=user.role,
        session_id=session_id,
        query_raw=request.query,
        query_enhanced=None,
        query_classification=None,
        sources_retrieved=[{"id": c.get("id"), "similarity": c.get("similarity")} for c in reranked],
        sources_cited=[c.model_dump() for c in citations],
        response_text=full_text,
        model_used=settings.anthropic_model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        latency_ms=latency_ms,
        safety_flags=[],
        emergency_triggered=emergency_triggered,
        flagged_for_review=False,
        ip_hash=ip_hash,
    )
    asyncio.create_task(log_query(audit_event))


@router.post("/query/stream")
async def query_stream(
    request: Request,
    body: QueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> StreamingResponse:
    await check_rate_limit(user)
    session_id = body.session_id or str(uuid.uuid4())
    client_ip = request.client.host if request.client else None

    return StreamingResponse(
        _event_generator(body, user, client_ip, session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
