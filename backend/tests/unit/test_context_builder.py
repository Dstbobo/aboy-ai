import pytest
from app.core.rag.context_builder import build_context


def test_build_context_chunks_only():
    chunks = [{"section_title": "Pharmacology", "content": "Metformin reduces hepatic glucose production."}]
    result = build_context(chunks, [])
    assert "Metformin" in result
    assert "Knowledge Base" in result


def test_build_context_web_only():
    web = [{"title": "CDC Article", "url": "https://cdc.gov/x", "content": "Diabetes stats."}]
    result = build_context([], web)
    assert "CDC Article" in result
    assert "Web Search" in result


def test_build_context_both():
    chunks = [{"section_title": "Pharmacology", "content": "Content A"}]
    web = [{"title": "Source B", "url": "https://who.int", "content": "Content B"}]
    result = build_context(chunks, web)
    assert "Content A" in result
    assert "Content B" in result


def test_build_context_empty():
    result = build_context([], [])
    assert result == ""
