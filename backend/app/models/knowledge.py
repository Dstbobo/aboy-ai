from datetime import date, datetime
from pydantic import BaseModel


class KnowledgeSourceCreate(BaseModel):
    name: str
    source_type: str
    url: str | None = None
    evidence_grade: str | None = None
    specialty_tags: list[str] = []
    publication_date: date | None = None


class KnowledgeSourceResponse(BaseModel):
    id: str
    name: str
    source_type: str
    url: str | None
    evidence_grade: str | None
    specialty_tags: list[str]
    ingestion_status: str
    chunk_count: int
    is_active: bool
    created_at: datetime
