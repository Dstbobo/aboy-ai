from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.config import get_settings
from app.core.auth.middleware import get_current_user
from app.core.llm.gemini import analyze_image, transcribe_audio
from app.models.user import AuthenticatedUser

router = APIRouter()

_MAX_BYTES = 20 * 1024 * 1024  # 20 MB cap for inline data


def _guess_audio_mime(filename: str, fallback: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".wav"):
        return "audio/wav"
    if name.endswith(".aac"):
        return "audio/aac"
    if name.endswith(".mp3"):
        return "audio/mp3"
    if name.endswith(".ogg"):
        return "audio/ogg"
    if name.endswith(".flac"):
        return "audio/flac"
    if name.endswith((".m4a", ".mp4")):
        return "audio/aac"
    return fallback or "audio/aac"


@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Transcribe an audio file to text using Gemini."""
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice transcription is not configured (missing GEMINI_API_KEY).",
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")
    if len(audio_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large (max 20 MB).")

    mime = _guess_audio_mime(file.filename or "", file.content_type or "")
    try:
        text = await transcribe_audio(audio_bytes, mime)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {exc}") from exc

    return {"text": text}


@router.post("/vision")
async def vision(
    file: UploadFile = File(...),
    prompt: str = Form(
        "You are a healthcare study tutor. Look at this image (a textbook page, "
        "handwritten notes, diagram, or clinical photo) and explain what it shows "
        "clearly and concisely for a health student. If it is text, read and explain "
        "the key points."
    ),
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Analyze an image (textbook, notes, wound, etc.) with Gemini vision."""
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vision is not configured (missing GEMINI_API_KEY).",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file.")
    if len(image_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 20 MB).")

    mime = file.content_type or "image/jpeg"
    try:
        text = await analyze_image(image_bytes, mime, prompt)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vision failed: {exc}") from exc

    return {"text": text}
