from functools import lru_cache

import anthropic
import httpx
from groq import AsyncGroq

from app.config import get_settings


# ── Client pools (reused, not recreated) ──

@lru_cache
def _get_anthropic_client() -> anthropic.AsyncAnthropic:
    http_client = httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=40, keepalive_expiry=60),
        # A full 8192-token answer can take well over 30s to generate; allow up
        # to 120s to read the completion.
        timeout=httpx.Timeout(120.0, connect=5.0),
    )
    return anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key, http_client=http_client)


@lru_cache
def _get_groq_client() -> AsyncGroq:
    return AsyncGroq(api_key=get_settings().groq_api_key, timeout=120.0)


def _groq_model_for(model: str | None) -> str:
    """Map the requested Anthropic tier to the matching Groq model, so the
    pipeline's haiku/sonnet routing keeps working unchanged."""
    settings = get_settings()
    is_fast = bool(model) and (
        model == settings.anthropic_haiku_model or "haiku" in (model or "")
    )
    return settings.groq_fast_model if is_fast else settings.groq_model


# ── Public API (unchanged signatures — the pipeline calls these) ──

async def generate_response(
    system_prompt: str, user_prompt: str, model: str | None = None, max_tokens: int | None = None
) -> tuple[str, int, int]:
    """Returns (response_text, input_tokens, output_tokens)."""
    settings = get_settings()
    max_toks = max_tokens or settings.max_tokens

    if settings.llm_provider == "groq":
        client = _get_groq_client()
        resp = await client.chat.completions.create(
            model=_groq_model_for(model),
            max_tokens=max_toks,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        text = resp.choices[0].message.content or "" if resp.choices else ""
        usage = resp.usage
        return text, (usage.prompt_tokens if usage else 0), (usage.completion_tokens if usage else 0)

    # Anthropic (Claude) — used when LLM_PROVIDER=anthropic.
    client = _get_anthropic_client()
    message = await client.messages.create(
        model=model or settings.anthropic_model,
        max_tokens=max_toks,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = message.content[0].text if message.content else ""
    return text, message.usage.input_tokens, message.usage.output_tokens


async def stream_response(
    system_prompt: str, user_prompt: str, model: str | None = None,
    max_tokens: int | None = None, usage_out: dict | None = None,
):
    """Yields text chunks for SSE streaming. Fills usage_out with token counts."""
    settings = get_settings()
    max_toks = max_tokens or settings.max_tokens

    if settings.llm_provider == "groq":
        client = _get_groq_client()
        stream = await client.chat.completions.create(
            model=_groq_model_for(model),
            max_tokens=max_toks,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
            # Groq includes token usage on the final chunk (under x_groq.usage,
            # or chunk.usage on newer SDKs) — no stream_options needed.
            if usage_out is not None:
                u = getattr(chunk, "usage", None)
                xg = getattr(chunk, "x_groq", None)
                if xg is not None:
                    u = getattr(xg, "usage", None) or u
                if u is not None:
                    usage_out["input"] = getattr(u, "prompt_tokens", 0)
                    usage_out["output"] = getattr(u, "completion_tokens", 0)
        return

    # Anthropic (Claude) — used when LLM_PROVIDER=anthropic.
    client = _get_anthropic_client()
    async with client.messages.stream(
        model=model or settings.anthropic_model,
        max_tokens=max_toks,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
        if usage_out is not None:
            try:
                final = await stream.get_final_message()
                usage_out["input"] = final.usage.input_tokens
                usage_out["output"] = final.usage.output_tokens
            except Exception:
                pass
