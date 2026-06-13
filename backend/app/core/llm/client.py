from functools import lru_cache

import anthropic
import httpx

from app.config import get_settings


@lru_cache
def _get_anthropic_client() -> anthropic.AsyncAnthropic:
    # Persistent keep-alive connection pool — connections reused, not recreated.
    http_client = httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=40, keepalive_expiry=60),
        timeout=httpx.Timeout(30.0, connect=5.0),
    )
    return anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key, http_client=http_client)


async def generate_response(
    system_prompt: str, user_prompt: str, model: str | None = None
) -> tuple[str, int, int]:
    """Returns (response_text, input_tokens, output_tokens)."""
    settings = get_settings()
    client = _get_anthropic_client()

    message = await client.messages.create(
        model=model or settings.anthropic_model,
        max_tokens=settings.max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    text = message.content[0].text if message.content else ""
    return text, message.usage.input_tokens, message.usage.output_tokens


async def stream_response(system_prompt: str, user_prompt: str, model: str | None = None):
    """Yields text chunks for SSE streaming."""
    settings = get_settings()
    client = _get_anthropic_client()

    async with client.messages.stream(
        model=model or settings.anthropic_model,
        max_tokens=settings.max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
