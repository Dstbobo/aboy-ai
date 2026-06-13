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
from app.core.rag.classifier import TIER_CONVERSATIONAL, TIER_STATIC, classify
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


async def _vector_retrieve(query: str) -> list[dict]:
    embedding = await embed_query(query)
    return await retrieve_chunks(embedding)


async def _event_generator(
    request: QueryRequest,
    user: AuthenticatedUser,
    client_ip: str | None,
    session_id: str,
):
    start = time.monotonic()
    first_token_at: float | None = None
    settings = get_settings()
    emergency_triggered = check_emergency(request.query)
    cls = classify(request.query)

    # Tell the client the session id immediately.
    yield f"data: {json.dumps({'type': 'start', 'session_id': session_id, 'tier': cls.tier})}\n\n"

    # ── Tier-aware retrieval (Tier 1 skips it entirely for a fast first token) ──
    reranked: list[dict] = []
    web_results: list[dict] = []
    if cls.tier == TIER_STATIC:
        reranked = rerank_chunks(await _vector_retrieve(request.query))
    elif cls.tier != TIER_CONVERSATIONAL:
        raw, web_results = await asyncio.gather(
            _vector_retrieve(request.query),
            web_search(request.query),
        )
        reranked = rerank_chunks(raw)

    # ── Model + length tiering ──
    haiku, sonnet = settings.anthropic_haiku_model, settings.anthropic_model
    if cls.tier == TIER_CONVERSATIONAL:
        model, max_tokens = haiku, 300
    elif cls.tier == TIER_STATIC and not cls.detailed:
        model, max_tokens = haiku, 700
    else:
        model, max_tokens = sonnet, 1200

    context = build_context(reranked, web_results) if (reranked or web_results) else ""
    system_prompt = get_system_prompt(user.role, getattr(user, "sub_role", None))
    if cls.tier == TIER_CONVERSATIONAL:
        system_prompt += " This is a brief conversational message — reply naturally and concisely without citations."
    user_prompt = build_user_prompt(request.query, context, request.history)

    full_text = ""
    async for chunk in stream_response(system_prompt, user_prompt, model=model, max_tokens=max_tokens):
        if first_token_at is None:
            first_token_at = time.monotonic()
        full_text += chunk
        yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"

    citations = _build_citations(reranked, web_results)
    yield f"data: {json.dumps({'type': 'meta', 'citations': [c.model_dump() for c in citations], 'emergency_triggered': emergency_triggered, 'session_id': session_id})}\n\n"
    yield "data: [DONE]\n\n"

    latency_ms = int((time.monotonic() - start) * 1000)
    ttft_ms = int(((first_token_at or time.monotonic()) - start) * 1000)
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest() if client_ip else None

    import logging
    logging.getLogger(__name__).info(
        "STREAM tier=%d model=%s ttft=%dms total=%dms q=%.40s",
        cls.tier, "haiku" if model == haiku else "sonnet", ttft_ms, latency_ms, request.query,
    )

    asyncio.create_task(log_query(AuditEvent(
        user_id=user.user_id, user_role=user.role, session_id=session_id,
        query_raw=request.query, query_enhanced=None, query_classification=f"tier{cls.tier}",
        sources_retrieved=[{"id": c.get("id"), "similarity": c.get("similarity")} for c in reranked],
        sources_cited=[c.model_dump() for c in citations],
        response_text=full_text, model_used=model,
        tokens_input=0, tokens_output=len(full_text.split()),
        latency_ms=latency_ms, safety_flags=[], emergency_triggered=emergency_triggered,
        flagged_for_review=False, ip_hash=ip_hash,
    )))


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
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
