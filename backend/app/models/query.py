from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    session_id: str | None = None


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
