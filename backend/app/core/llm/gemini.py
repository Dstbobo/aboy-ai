"""
Gemini multimodal helper — audio transcription and image (vision) understanding
via the Generative Language REST API. Uses httpx directly (no extra SDK).

Note on "Live API": true bidirectional realtime streaming (PCM over WebSocket)
is not feasible from Expo/React Native audio capture, so the app uses a
turn-based loop (record -> transcribe -> answer -> speak) built on these
request/response multimodal calls.
"""
import base64

import httpx

from app.config import get_settings

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


async def _generate(parts: list[dict]) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    url = f"{_BASE}/{settings.gemini_model}:generateContent"
    payload = {"contents": [{"parts": parts}]}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            headers={
                "x-goog-api-key": settings.gemini_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Gemini error ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return ""
    out_parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in out_parts).strip()


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
