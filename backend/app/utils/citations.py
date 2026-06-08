from app.models.query import CitationModel


def format_citation(citation: CitationModel) -> str:
    grade = f" [Grade {citation.evidence_grade}]" if citation.evidence_grade else ""
    section = f" — {citation.section_title}" if citation.section_title else ""
    url = f" {citation.url}" if citation.url else ""
    return f"[{citation.source_name}{grade}]{section}{url}"


def build_citation_block(citations: list[CitationModel]) -> str:
    if not citations:
        return ""
    lines = ["\n\n---\n**Sources:**"]
    for i, c in enumerate(citations, 1):
        lines.append(f"{i}. {format_citation(c)}")
    return "\n".join(lines)
