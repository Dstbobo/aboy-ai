from pydantic import BaseModel


class AuditEvent(BaseModel):
    user_id: str
    user_role: str
    session_id: str | None
    query_raw: str
    query_enhanced: str | None
    query_classification: str | None
    sources_retrieved: list[dict]
    sources_cited: list[dict]
    response_text: str
    model_used: str
    tokens_input: int
    tokens_output: int
    latency_ms: int
    safety_flags: list[str]
    emergency_triggered: bool
    flagged_for_review: bool
    ip_hash: str | None
