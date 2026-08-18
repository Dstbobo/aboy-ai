from app.config import get_settings


def rerank_chunks(chunks: list[dict], top_k: int | None = None) -> list[dict]:
    """Re-rank retrieved chunks by similarity score and return top_k."""
    if not chunks:
        return []
    k = top_k if top_k is not None else get_settings().rerank_top_k
    sorted_chunks = sorted(chunks, key=lambda c: c.get("similarity", 0), reverse=True)
    return sorted_chunks[:k]
