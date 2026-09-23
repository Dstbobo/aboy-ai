"""
Gemini multimodal helper — audio transcription and image (vision) understanding
via the Generative Language REST API. Uses httpx directly (no extra SDK).

Note on "Live API": true bidirectional realtime streaming (PCM over WebSocket)
is not feasible from Expo/React Native audio capture, so the app uses a
turn-based loop (record -> transcribe -> answer -> speak) built on these
request/response multimodal calls.
"""
import asyncio
import base64

import httpx

from app.config import get_settings

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Gemini-2.5-flash can return transient 503 (overloaded) / 429 — retry briefly.
_RETRY_STATUSES = {429, 500, 503}
_MAX_ATTEMPTS = 4


async def _generate(parts: list[dict]) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    url = f"{_BASE}/{settings.gemini_model}:generateContent"
    payload = {"contents": [{"parts": parts}]}
    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }

    last_status = 0
    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(_MAX_ATTEMPTS):
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    return ""
                out_parts = candidates[0].get("content", {}).get("parts", [])
                return "".join(p.get("text", "") for p in out_parts).strip()

            last_status = resp.status_code
            if resp.status_code in _RETRY_STATUSES and attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(1.5 * (attempt + 1))  # 1.5s, 3s, 4.5s
                continue
            break

    raise RuntimeError(f"Gemini request failed with status {last_status}")


async def transcribe_audio(audio_bytes: bytes, mime_type: str) -> str:
    b64 = base64.b64encode(audio_bytes).decode("ascii")
    parts = [
        {"inline_data": {"mime_type": mime_type, "data": b64}},
        {"text": "Transcribe the spoken audio verbatim. Return ONLY the transcription text, no commentary."},
    ]
    return await _generate(parts)


async def analyze_image(image_bytes: bytes, mime_type: str, prompt: str) -> str:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    parts = [
        {"inline_data": {"mime_type": mime_type, "data": b64}},
        {"text": prompt},
    ]
    return await _generate(parts)
