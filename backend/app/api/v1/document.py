"""Document upload + explanation.

Accepts a PDF, Word (.docx) or text file, extracts its text, and returns a clear
explanation/summary for a health student (optionally answering the user's note).
Mirrors the vision flow but for documents. Scanned/image-only PDFs (no text
layer) are rejected with a helpful message.
"""

import io
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.core.auth.middleware import get_current_user
from app.core.llm.client import generate_response
from app.models.user import AuthenticatedUser

router = APIRouter()
logger = logging.getLogger(__name__)

_MAX_BYTES = 15 * 1024 * 1024  # 15 MB
_MAX_CHARS = 30000             # keep the extracted text within the model context

_SYSTEM = (
    "You are a healthcare study tutor. The student has uploaded a document "
    "(lecture notes, a paper, a guideline, or similar). Explain it clearly and "
    "accurately for a health student, highlighting the key points they should "
    "take away. Base your answer ONLY on the document content provided."
)


def _extract_text(data: bytes, filename: str, mime: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".txt") or (mime or "").startswith("text/"):
        return data.decode("utf-8", errors="ignore")
    if name.endswith(".pdf") or mime == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    if name.endswith(".docx"):
        import docx
        document = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in document.paragraphs)
    raise ValueError("unsupported file type")


@router.post("/document")
async def analyze_document(
    file: UploadFile = File(...),
    prompt: str = Form(
        "Summarise and explain the key points of this document for a health student."
    ),
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    settings = get_settings()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB).")

    try:
        text = _extract_text(data, file.filename or "", file.content_type or "")
    except Exception:
        raise HTTPException(
            status_code=415,
            detail="Unsupported or unreadable file. Please upload a PDF, Word (.docx) or text file.",
        )

    text = text.strip()
    if not text:
        raise HTTPException(
            status_code=422,
            detail="No readable text found — the document may be scanned images rather than text.",
        )
    text = text[:_MAX_CHARS]

    user_prompt = f"{prompt}\n\nDocument content:\n{text}"
    try:
        answer, _, _ = await generate_response(
            _SYSTEM, user_prompt, model=settings.anthropic_model, max_tokens=2000
        )
    except Exception as exc:
        logger.warning("document analysis failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not analyze the document. Please try again.")

    return {"text": answer}
