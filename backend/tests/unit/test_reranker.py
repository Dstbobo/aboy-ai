import pytest
from app.core.rag.reranker import rerank_chunks


def test_reranker_returns_top_k():
    chunks = [{"similarity": float(i) / 10} for i in range(10)]
    result = rerank_chunks(chunks, top_k=3)
    assert len(result) == 3


def test_reranker_orders_by_similarity():
    chunks = [
        {"similarity": 0.7, "id": "b"},
        {"similarity": 0.9, "id": "a"},
        {"similarity": 0.5, "id": "c"},
    ]
    result = rerank_chunks(chunks, top_k=3)
    assert result[0]["id"] == "a"
    assert result[1]["id"] == "b"
    assert result[2]["id"] == "c"


def test_reranker_handles_empty():
    assert rerank_chunks([]) == []
