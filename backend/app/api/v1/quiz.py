"""Multiple-choice quiz generation.

Generates board-style MCQs for a topic via the LLM and returns them as strict
JSON the app renders as a tap-to-answer exam (question, 4 options, correct index,
explanation). No retrieval — this is generated assessment, kept factual by the
system prompt; the app grades locally from `correct`.
"""

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core.auth.middleware import get_current_user
from app.core.llm.client import generate_response
from app.models.user import AuthenticatedUser

router = APIRouter()
logger = logging.getLogger(__name__)


class QuizRequest(BaseModel):
    topic: str = ""
    count: int = Field(default=5, ge=1, le=10)


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct: int
    explanation: str


class QuizResponse(BaseModel):
    topic: str
    questions: list[QuizQuestion]


_SYSTEM = (
    "You are a medical exam question writer. Write accurate, board-style "
    "multiple-choice questions for healthcare students. Each question has exactly "
    "4 options with exactly one correct, plus a one- to two-sentence explanation of "
    "why the correct answer is right. Questions must be factually correct and "
    "clinically sound. Output ONLY valid JSON — no markdown, no preamble."
)


def _build_prompt(topic: str, count: int) -> str:
    subject = topic.strip() or "general medicine across common high-yield topics"
    return (
        f"Create {count} multiple-choice questions on: {subject}.\n"
        "Return a JSON object with EXACTLY this shape:\n"
        '{"questions": [{"question": "...", "options": ["...", "...", "...", "..."], '
        '"correct": 0, "explanation": "..."}]}\n'
        "Rules:\n"
        "- 'correct' is the 0-based index of the right option.\n"
        "- Exactly 4 options each; vary which position is correct.\n"
        "- Options are concise and contain no 'A)'/'B)' labels.\n"
        "Output ONLY the JSON object."
    )


def _parse(raw: str) -> list[dict]:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.IGNORECASE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    data = json.loads(text[start:end + 1])
    out: list[dict] = []
    for q in (data.get("questions") or []):
        opts = q.get("options") or []
        correct = q.get("correct")
        if (not isinstance(q.get("question"), str) or len(opts) != 4
                or not isinstance(correct, int) or not (0 <= correct <= 3)):
            continue
        out.append({
            "question": q["question"].strip(),
            "options": [str(o).strip() for o in opts],
            "correct": correct,
            "explanation": str(q.get("explanation", "")).strip(),
        })
    return out


@router.post("/quiz", response_model=QuizResponse)
async def make_quiz(
    body: QuizRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> QuizResponse:
    settings = get_settings()
    prompt = _build_prompt(body.topic, body.count)
    try:
        raw, _, _ = await generate_response(
            _SYSTEM, prompt, model=settings.anthropic_model, max_tokens=2000
        )
        questions = _parse(raw)
    except Exception as exc:
        logger.warning("quiz generation failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not generate a quiz. Please try again.")
    if not questions:
        raise HTTPException(status_code=502, detail="Could not generate a quiz. Please try again.")
    return QuizResponse(topic=body.topic.strip(), questions=questions)
