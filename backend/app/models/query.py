from pydantic import BaseModel, Field


class HistoryTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str = Field(..., max_length=4000)


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    session_id: str | None = None
    # Recent conversation turns (text AND voice share one thread) so the
    # model remembers the ongoing discussion.
    history: list[HistoryTurn] | None = Field(default=None, max_length=12)


class CitationModel(BaseModel):
    source_id: str
    source_name: str
    section_title: str | None
    url: str | None
    evidence_grade: str | None
    similarity: float


class QueryResponse(BaseModel):
    answer: str
    citations: list[CitationModel]
    session_id: str
    emergency_triggered: bool = False
    model_used: str
    latency_ms: int
