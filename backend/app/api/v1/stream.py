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
from app.core.llm.sanitize import StreamFilter, sanitize_answer
from app.core.llm.prompts import build_user_prompt, get_system_prompt, VISUAL_DIRECTIVE
from app.core.rag.classifier import TIER_CONVERSATIONAL, TIER_STATIC, classify
from app.core.rag.context_builder import build_context
from app.core.rag.embedder import embed_query
from app.core.rag.pipeline import _build_citations
from app.core.rag.reranker import rerank_chunks
from app.core.rag.retriever import retrieve_chunks
from app.core.rag.web_search import web_search
from app.core.media.image_search import find_medical_image, is_visual_question
from app.core.intelligence.profile import (
    get_raw_profile,
    personalization_snippet,
    update_profile_after_query,
)
from app.config import get_settings
from app.core.token_budget import LIMIT_MESSAGE, add_usage, is_exhausted
from app.utils.background import fire_and_forget
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

    # ── Daily token budget (beta) ──
    if await is_exhausted(user.user_id):
        yield f"data: {json.dumps({'type': 'text', 'content': LIMIT_MESSAGE})}\n\n"
        yield f"data: {json.dumps({'type': 'meta', 'citations': [], 'emergency_triggered': False, 'session_id': session_id})}\n\n"
        yield "data: [DONE]\n\n"
        return

    # ── Auto medical illustration: look it up in parallel; emit after text ──
    img_task = (
        asyncio.create_task(find_medical_image(request.query, user.role))
        if cls.tier != TIER_CONVERSATIONAL
        else None
    )

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
        model = haiku
    elif cls.tier == TIER_STATIC and not cls.detailed:
        model = haiku
    else:
        model = sonnet
    max_tokens = 8192  # never truncate — full answers with conclusions

    context = build_context(reranked, web_results) if (reranked or web_results) else ""
    system_prompt = get_system_prompt(user.role, getattr(user, "sub_role", None))
    if cls.tier != TIER_CONVERSATIONAL:
        system_prompt += personalization_snippet(await get_raw_profile(user.user_id))
        # Tier B: visual/structural topics get a labelled breakdown so the text
        # reads like a textbook figure even when no image is attached.
        if is_visual_question(request.query, user.role):
            system_prompt += VISUAL_DIRECTIVE
    if cls.tier == TIER_CONVERSATIONAL:
        system_prompt += " This is a brief conversational message — reply naturally and concisely without citations."
    user_prompt = build_user_prompt(request.query, context, request.history)

    full_text = ""
    usage: dict = {}
    sfilter = StreamFilter()  # strip references section + "see diagram below" phrases
    async for chunk in stream_response(system_prompt, user_prompt, model=model, max_tokens=max_tokens, usage_out=usage):
        if first_token_at is None:
            first_token_at = time.monotonic()
        full_text += chunk
        safe = sfilter.feed(chunk)
        if safe:
            yield f"data: {json.dumps({'type': 'text', 'content': safe})}\n\n"
    tail = sfilter.flush()
    if tail:
        yield f"data: {json.dumps({'type': 'text', 'content': tail})}\n\n"
    full_text = sanitize_answer(full_text)

    # Record actual token usage against the daily budget (background).
    total_tokens = (usage.get("input", 0) or 0) + (usage.get("output", 0) or 0)
    if total_tokens:
        fire_and_forget(add_usage(user.user_id, total_tokens))

    # Image arrives below the text (never blocks the stream's first token).
    if img_task is not None:
        try:
            image = await img_task
            if image:
                yield f"data: {json.dumps({'type': 'image', 'image': image})}\n\n"
        except Exception:
            pass

    citations = _build_citations(reranked, web_results)
    # Stable id for THIS answer so the client can attach feedback to it.
    audit_id = str(uuid.uuid4())
    yield f"data: {json.dumps({'type': 'meta', 'citations': [c.model_dump() for c in citations], 'emergency_triggered': emergency_triggered, 'session_id': session_id, 'audit_id': audit_id})}\n\n"
    yield "data: [DONE]\n\n"

    latency_ms = int((time.monotonic() - start) * 1000)
    ttft_ms = int(((first_token_at or time.monotonic()) - start) * 1000)
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest() if client_ip else None

    import logging
    logging.getLogger(__name__).info(
        "STREAM tier=%d model=%s ttft=%dms total=%dms q=%.40s",
        cls.tier, "haiku" if model == haiku else "sonnet", ttft_ms, latency_ms, request.query,
    )

    fire_and_forget(log_query(AuditEvent(
        id=audit_id,
        user_id=user.user_id, user_role=user.role, session_id=session_id,
        query_raw=request.query, query_enhanced=None, query_classification=f"tier{cls.tier}",
        sources_retrieved=[{"id": c.get("id"), "similarity": c.get("similarity")} for c in reranked],
        sources_cited=[c.model_dump() for c in citations],
        response_text=full_text, model_used=model,
        tokens_input=0, tokens_output=len(full_text.split()),
        latency_ms=latency_ms, safety_flags=[], emergency_triggered=emergency_triggered,
        flagged_for_review=False, ip_hash=ip_hash,
    )))
    if cls.tier != TIER_CONVERSATIONAL:
        fire_and_forget(update_profile_after_query(user.user_id, user.role, session_id, request.query))


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
