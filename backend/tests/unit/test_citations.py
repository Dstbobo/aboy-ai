import pytest
from app.models.query import CitationModel
from app.utils.citations import format_citation, build_citation_block


def _make_citation(**kwargs) -> CitationModel:
    defaults = {
        "source_id": "abc",
        "source_name": "WHO 2023",
        "section_title": None,
        "url": None,
        "evidence_grade": None,
        "similarity": 0.85,
    }
    return CitationModel(**{**defaults, **kwargs})


def test_format_citation_basic():
    c = _make_citation(source_name="NICE NG28")
    result = format_citation(c)
    assert "NICE NG28" in result


def test_format_citation_with_grade():
    c = _make_citation(evidence_grade="A")
    result = format_citation(c)
    assert "Grade A" in result


def test_format_citation_with_url():
    c = _make_citation(url="https://who.int/test")
    result = format_citation(c)
    assert "https://who.int/test" in result


def test_build_citation_block_empty():
    assert build_citation_block([]) == ""


def test_build_citation_block_numbered():
    citations = [_make_citation(source_name=f"Source {i}") for i in range(3)]
    block = build_citation_block(citations)
    assert "1." in block
    assert "2." in block
    assert "Sources" in block
