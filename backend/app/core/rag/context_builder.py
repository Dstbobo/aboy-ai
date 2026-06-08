def build_context(chunks: list[dict], web_results: list[dict]) -> str:
    parts: list[str] = []

    if chunks:
        parts.append("## Knowledge Base Sources\n")
        for i, chunk in enumerate(chunks, 1):
            title = chunk.get("section_title") or "Excerpt"
            parts.append(f"[Source {i} — {title}]\n{chunk['content']}\n")

    if web_results:
        parts.append("\n## Web Search Results (verified medical sources)\n")
        for i, result in enumerate(web_results, 1):
            parts.append(
                f"[Web {i} — {result.get('title', 'Source')}]\n"
                f"URL: {result.get('url', '')}\n"
                f"{result.get('content', '')}\n"
            )

    return "\n".join(parts)
