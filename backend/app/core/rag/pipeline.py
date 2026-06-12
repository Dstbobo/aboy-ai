import asyncio
import hashlib
import time

from app.core.audit.logger import log_query
from app.core.audit.models import AuditEvent
from app.core.llm.client import generate_response
from app.core.llm.prompts import build_user_prompt, get_system_prompt
from app.core.llm.safety import is_safe_output
from app.core.rag.context_builder import build_context
from app.core.rag.embedder import embed_query
from app.core.rag.reranker import rerank_chunks
from app.core.rag.retriever import retrieve_chunks
from app.core.rag.web_search import web_search
from app.models.query import CitationModel, QueryRequest, QueryResponse
from app.models.user import AuthenticatedUser
from app.config import get_settings
from app.utils.emergency import check_emergency


async def run_rag_pipeline(
    request: QueryRequest,
    user: AuthenticatedUser,
    client_ip: str | None,
    session_id: str,
) -> QueryResponse:
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
    user_prompt = build_user_prompt(request.query, context, request.history)

    answer, tokens_in, tokens_out = await generate_response(system_prompt, user_prompt)

    if not is_safe_output(answer):
        answer = "I'm unable to provide a response to this query. Please consult a qualified healthcare professional."

    citations = _build_citations(reranked, web_results)

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
        response_text=answer,
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

    return QueryResponse(
        answer=answer,
        citations=citations,
        session_id=session_id,
        emergency_triggered=emergency_triggered,
        model_used=settings.anthropic_model,
        latency_ms=latency_ms,
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
