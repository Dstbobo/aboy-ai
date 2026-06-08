from functools import lru_cache

import anthropic

from app.config import get_settings


@lru_cache
def _get_anthropic_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key)


async def generate_response(system_prompt: str, user_prompt: str) -> tuple[str, int, int]:
    """Returns (response_text, input_tokens, output_tokens)."""
    settings = get_settings()
    client = _get_anthropic_client()

    message = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=settings.max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    text = message.content[0].text if message.content else ""
    return text, message.usage.input_tokens, message.usage.output_tokens


async def stream_response(system_prompt: str, user_prompt: str):
    """Yields text chunks for SSE streaming."""
    settings = get_settings()
    client = _get_anthropic_client()

    async with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=settings.max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
