import asyncio
import hashlib
import time

from app.config import get_settings
from app.core.audit.logger import log_query
from app.core.audit.models import AuditEvent
from app.core.cache import cache_get, cache_set, query_hash, TTL_RESPONSE
from app.core.token_budget import LIMIT_MESSAGE, add_usage, is_exhausted
from app.core.llm.client import generate_response
from app.core.llm.prompts import build_user_prompt, get_system_prompt
from app.core.llm.safety import is_safe_output
from app.core.llm.sanitize import strip_reference_section
from app.core.media.image_search import find_medical_image
from app.utils.background import fire_and_forget
from app.core.intelligence.profile import (
    get_raw_profile,
    personalization_snippet,
    update_profile_after_query,
)
from app.core.rag.classifier import (
    TIER_CONVERSATIONAL,
    TIER_DYNAMIC,
    TIER_STATIC,
    classify,
)
from app.core.rag.context_builder import build_context
from app.core.rag.embedder import embed_query
from app.core.rag.reranker import rerank_chunks
from app.core.rag.retriever import retrieve_chunks
from app.core.rag.web_search import web_search
from app.models.query import CitationModel, MedicalImage, QueryRequest, QueryResponse
from app.models.user import AuthenticatedUser
from app.utils.emergency import check_emergency

import logging

logger = logging.getLogger(__name__)


async def _vector_retrieve(query: str) -> list[dict]:
    """Embedding + pgvector search as one task (so it can run in parallel)."""
    embedding = await embed_query(query)
    return await retrieve_chunks(embedding)


async def run_rag_pipeline(
    request: QueryRequest,
    user: AuthenticatedUser,
    client_ip: str | None,
    session_id: str,
) -> QueryResponse:
    start = time.monotonic()
    settings = get_settings()
    emergency_triggered = check_emergency(request.query)

    # ── Daily token budget (beta) ──
    if await is_exhausted(user.user_id):
        return QueryResponse(
            answer=LIMIT_MESSAGE, citations=[], session_id=session_id,
            emergency_triggered=False, model_used="none",
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    cls = classify(request.query)

    # ── Auto medical illustration (kick off early so even cache hits get one) ──
    img_task = (
        asyncio.create_task(find_medical_image(request.query, user.role))
        if cls.tier != TIER_CONVERSATIONAL
        else None
    )

    async def _await_image():
        if img_task is None:
            return None
        try:
            img = await img_task
            return MedicalImage(**img) if img else None
        except Exception:
            return None

    # ── Exact response cache (skip the entire pipeline) ──
    # Keyed by normalized query + role so personalised answers stay correct.
    # v2: bump invalidates answers cached before the citation-sanitisation fix.
    resp_key = f"resp:v2:{user.role}:{query_hash(request.query)}"
    if not request.history:  # only reuse for fresh (non-follow-up) questions
        cached = await cache_get(resp_key)
        if cached:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.info("tier=%d CACHE_HIT latency=%dms q=%.40s", cls.tier, latency_ms, request.query)
            return QueryResponse(
                answer=cached["answer"],
                citations=[CitationModel(**c) for c in cached["citations"]],
                session_id=session_id,
                emergency_triggered=emergency_triggered,
                model_used=cached.get("model_used", settings.anthropic_model),
                latency_ms=latency_ms,
                image=await _await_image(),
            )

    # ── Model selection (tiering) ──
    haiku = settings.anthropic_haiku_model
    sonnet = settings.anthropic_model
    model = haiku if (cls.tier == TIER_CONVERSATIONAL or (cls.tier == TIER_STATIC and not cls.detailed)) else sonnet

    # ── Retrieval (tier-aware, parallel where both are needed) ──
    reranked: list[dict] = []
    web_results: list[dict] = []

    if cls.tier == TIER_CONVERSATIONAL:
        pass  # no retrieval
    elif cls.tier == TIER_STATIC:
        raw = await _vector_retrieve(request.query)  # vector only, no Tavily
        reranked = rerank_chunks(raw)
    else:  # TIER_DYNAMIC — vector + web in parallel: total = max(), not sum()
        vec_task = asyncio.create_task(_vector_retrieve(request.query))
        web_task = asyncio.create_task(web_search(request.query))
        raw, web_results = await asyncio.gather(vec_task, web_task)
        reranked = rerank_chunks(raw)

    # ── Generate ──
    context = build_context(reranked, web_results) if (reranked or web_results) else ""
    system_prompt = get_system_prompt(user.role, getattr(user, "sub_role", None))
    # Personalise depth based on what this learner already knows / struggles with.
    if cls.tier != TIER_CONVERSATIONAL:
        system_prompt += personalization_snippet(await get_raw_profile(user.user_id))
    if cls.tier == TIER_CONVERSATIONAL:
        system_prompt += (
            " This is a brief conversational message — reply naturally and concisely "
            "without citations or clinical detail."
        )
    user_prompt = build_user_prompt(request.query, context, request.history)

    # Never truncate — let Claude finish the full answer (8192 cap is a safety net).
    answer, tokens_in, tokens_out = await generate_response(
        system_prompt, user_prompt, model=model, max_tokens=8192
    )
    # Record actual usage against the daily budget (background).
    fire_and_forget(add_usage(user.user_id, (tokens_in or 0) + (tokens_out or 0)))

    # Remove any model-written Sources/References list (fabricated refs live here).
    answer = strip_reference_section(answer)

    if not is_safe_output(answer):
        answer = "I'm unable to provide a response to this query. Please consult a qualified healthcare professional."

    citations = _build_citations(reranked, web_results)
    image = await _await_image()
    latency_ms = int((time.monotonic() - start) * 1000)
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest() if client_ip else None

    logger.info(
        "tier=%d model=%s vec=%d web=%d latency=%dms q=%.40s",
        cls.tier, "haiku" if model == haiku else "sonnet",
        len(reranked), len(web_results), latency_ms, request.query,
    )

    # Populate response cache (fresh questions only).
    if not request.history and answer:
        await cache_set(
            resp_key,
            {
                "answer": answer,
                "citations": [c.model_dump() for c in citations],
                "model_used": model,
            },
            TTL_RESPONSE,
        )

    audit_event = AuditEvent(
        user_id=user.user_id,
        user_role=user.role,
        session_id=session_id,
        query_raw=request.query,
        query_enhanced=None,
        query_classification=f"tier{cls.tier}",
        sources_retrieved=[{"id": c.get("id"), "similarity": c.get("similarity")} for c in reranked],
        sources_cited=[c.model_dump() for c in citations],
        response_text=answer,
        model_used=model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        latency_ms=latency_ms,
        safety_flags=[],
        emergency_triggered=emergency_triggered,
        flagged_for_review=False,
        ip_hash=ip_hash,
    )
    fire_and_forget(log_query(audit_event))
    if cls.tier != TIER_CONVERSATIONAL:
        fire_and_forget(update_profile_after_query(user.user_id, user.role, session_id, request.query))

    return QueryResponse(
        answer=answer,
        citations=citations,
        session_id=session_id,
        emergency_triggered=emergency_triggered,
        model_used=model,
        latency_ms=latency_ms,
        image=image,
    )


def _build_citations(chunks: list[dict], web_results: list[dict]) -> list[CitationModel]:
    citations: list[CitationModel] = []
    for chunk in chunks:
        citations.append(CitationModel(
            source_id=chunk.get("source_id", ""),
            source_name=chunk.get("metadata", {}).get("source_name", "Knowledge Base"),
            section_title=chunk.get("section_title"),
            url=chunk.get("metadata", {}).get("url"),
            evidence_grade=chunk.get("metadata", {}).get("evidence_grade"),
            similarity=chunk.get("similarity", 0.0),
        ))
    for result in web_results:
        citations.append(CitationModel(
            source_id="web",
            source_name=result.get("title", "Web Source"),
            section_title=None,
            url=result.get("url"),
            evidence_grade=None,
            similarity=0.0,
        ))
    return citations
