"""
Fast keyword/structure query classifier — no LLM call.

Tier 1 CONVERSATIONAL  -> Claude Haiku, skip RAG entirely
Tier 2 STATIC INTERNAL -> vector search only (skip Tavily); Haiku if simple, Sonnet if detailed
Tier 3 DYNAMIC WEB     -> full pipeline (vector + Tavily); Sonnet
"""
from dataclasses import dataclass

TIER_CONVERSATIONAL = 1
TIER_STATIC = 2
TIER_DYNAMIC = 3


@dataclass
class Classification:
    tier: int
    detailed: bool  # True -> Sonnet, False -> Haiku (within tier rules)
    use_vector: bool
    use_web: bool


# Tier 1 — greetings / meta / thanks / trivial follow-ups
_CONVERSATIONAL = {
    "hi", "hii", "hey", "hello", "yo", "sup", "thanks", "thank you", "thx", "ok", "okay",
    "cool", "great", "nice", "got it", "bye", "goodbye", "good morning", "good afternoon",
    "good evening", "how are you", "who are you", "what can you do", "what do you do",
    "what are you", "help", "what is that again", "say that again", "repeat that",
    "what was that", "huh", "what", "continue", "go on", "tell me more",
}
_CONVERSATIONAL_PREFIXES = (
    "what can you", "who are you", "what are you", "can you help", "how do you work",
    "what do you do", "are you", "do you",
)

# Tier 3 — needs fresh web / synthesis
_DYNAMIC_KEYWORDS = (
    "latest", "newest", "recent", "2023", "2024", "2025", "2026", "this year", "last year",
    "update", "updated", "new guideline", "guidelines", "fda", "ema", "approved", "approval",
    "recall", "breaking", "news", "trial", "trials", "study published", "just published",
    "current recommendation", "outbreak", "pandemic", "emerging", "compared to", "vs ",
    "versus", "best evidence", "meta-analysis", "systematic review", "cost of", "price of",
    "availability", "in nigeria", "in the uk", "in the us", "who recommends",
)

# Tier 2 — classic static knowledge cues (used to bias toward static when ambiguous)
_STATIC_KEYWORDS = (
    "what is", "define", "definition", "mechanism of action", "moa", "explain", "describe",
    "anatomy", "physiology", "pathophysiology", "pathology", "pharmacology", "classification",
    "types of", "causes of", "symptoms of", "signs of", "function of", "structure of",
    "difference between", "normal range", "indication", "contraindication", "side effect",
)


def classify(query: str) -> Classification:
    q = query.strip().lower()
    words = q.split()
    n = len(words)

    # ── Tier 1: conversational ──
    stripped = q.rstrip("?!. ")
    if stripped in _CONVERSATIONAL or any(stripped.startswith(p) for p in _CONVERSATIONAL_PREFIXES):
        return Classification(TIER_CONVERSATIONAL, detailed=False, use_vector=False, use_web=False)
    # very short, no medical static cue, no question structure -> conversational
    if n <= 3 and not any(k in q for k in _STATIC_KEYWORDS):
        return Classification(TIER_CONVERSATIONAL, detailed=False, use_vector=False, use_web=False)

    # ── Tier 3: dynamic web ──
    if any(k in q for k in _DYNAMIC_KEYWORDS):
        return Classification(TIER_DYNAMIC, detailed=True, use_vector=True, use_web=True)
    # long, complex synthesis questions -> web for breadth
    if n >= 22:
        return Classification(TIER_DYNAMIC, detailed=True, use_vector=True, use_web=True)

    # ── Tier 2: static internal ──
    # "detailed" (Sonnet) when the user asks to explain/compare or it's a longer prompt;
    # otherwise Haiku for a quick definition.
    detailed = n >= 9 or any(
        k in q for k in ("explain", "describe", "compare", "difference between", "pathophysiology", "in detail", "mechanism")
    )
    return Classification(TIER_STATIC, detailed=detailed, use_vector=True, use_web=False)
