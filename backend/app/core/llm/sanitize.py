"""Deterministic answer sanitisation.

Two guarantees enforced regardless of what the model emits:
  1. No fabricated Sources/References section (real citations are shown as
     separate cards by the app).
  2. No "see the diagram below"-style image references — the image renders
     separately and is not guaranteed to appear, so the prose must never point
     to it (otherwise: "says image is below but nothing renders").

Both are applied to whole answers (non-streaming) and incrementally during
streaming via StreamFilter, which emits sentence-by-sentence so the regexes can
run on stable text before it reaches the client.
"""

from __future__ import annotations

import re

# ── Reference/sources section (everything from this header onward is cut) ──
_REF_HEADER_RE = re.compile(
    r"(?:^|\n)[ \t]*"
    r"(?:#{1,6}[ \t]*|\*{1,3}[ \t]*|_{1,3}[ \t]*)?"
    r"(?:sources|references|citations|bibliography|works\s+cited|further\s+reading)"
    r"[ \t]*:?[ \t]*(?:\*{1,3}|_{1,3})?[ \t]*(?:\n|$)",
    re.IGNORECASE,
)
_TRAILING_RULE_RE = re.compile(r"(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$")

_FIG = r"(?:diagram|figure|fig\.?|image|illustration|picture|chart|schematic)"
# ── "see the diagram below"-style references → removed ──
_IMG_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Whole imperative sentence: "See the diagram below for the chambers."
    (re.compile(rf"(?:(?<=[.!?])\s+|^)(?:please\s+)?(?:see|refer to)\s+the\s+{_FIG}\s+(?:below|above)\b[^.!?]*[.!?]+\s*", re.IGNORECASE), " "),
    # Whole sentence announcing an image will/should appear or is on screen:
    # "A diagram of the heart should appear on your screen."
    (re.compile(rf"(?:(?<=[.!?])\s+|^)[^.!?\n]*\b{_FIG}\b[^.!?\n]*\b(?:appears?|appearing|will\s+(?:appear|show|display|render|be\s+(?:shown|displayed|visible))|should\s+(?:appear|show|display|render)|is\s+(?:shown|displayed|rendered|visible)|on\s+(?:your\s+)?screen)\b[^.!?\n]*[.!?]+\s*", re.IGNORECASE), " "),
    # "You should see a diagram of the heart." (whole sentence)
    (re.compile(rf"(?:(?<=[.!?])\s+|^)you\s+(?:should|will|can|may|'?ll)\s+(?:see|find|notice|view|spot)\b[^.!?\n]*\b{_FIG}\b[^.!?\n]*[.!?]+\s*", re.IGNORECASE), " "),
    # Parenthetical: "(see the diagram below)", "(refer to figure above)"
    (re.compile(rf"\s*\((?:please\s+)?(?:see|refer to|cf\.?)[^)]*\b{_FIG}\b[^)]*\)", re.IGNORECASE), ""),
    # Lead-in clause: "As you can see in the diagram below, ..."
    (re.compile(rf"(?i)\b(?:as\s+(?:you\s+can\s+)?see|as\s+(?:shown|illustrated|depicted|seen|pictured))\s+(?:in|on)\s+the\s+{_FIG}\s+(?:below|above)\b\s*[,:]?\s*"), ""),
    # "visible/labelled in the figure below"
    (re.compile(rf"(?i)\s*[,;]?\s*(?:visible|labell?ed|marked|highlighted|shown|depicted)\s+(?:in|on)\s+the\s+{_FIG}\s+(?:below|above)\b"), ""),
    # Trailing/standalone: ", see the diagram below."
    (re.compile(rf"(?i)[,;:]?\s*(?:please\s+)?(?:see|refer to)\s+the\s+{_FIG}\s+(?:below|above)\b\.?"), ""),
    # Drop a dangling locator: "the diagram below shows" → "the diagram shows"
    (re.compile(rf"(?i)\b(the\s+{_FIG})\s+(?:below|above)\b"), r"\1"),
    # Generic: "shown below" / "depicted above" → "here"
    (re.compile(r"(?i)\b(?:shown|illustrated|depicted|pictured|seen)\s+(?:below|above)\b"), "here"),
    # Leftover "appears on your screen" / "displayed on screen" phrase
    (re.compile(r"(?i)\b(?:appears?|appearing|shown|displayed|rendered|visible)\s+(?:just\s+)?on\s+(?:your\s+)?screen\b"), ""),
]
_CLEANUP = [
    (re.compile(r"[ \t]{2,}"), " "),
    (re.compile(r"\s+([,.;:])"), r"\1"),
    (re.compile(r",\s*,"), ","),
    (re.compile(r"\(\s*\)"), ""),
    (re.compile(r"^[ \t]+"), ""),  # leading space left when a lead sentence was removed
]
_RECAP = re.compile(r"(^|[.!?]\s+|\n)([a-z])")


# Inline citation markers like "[Source 1]", "[Web 2]", "[1, 2]" → removed so the
# prose reads clean (ChatGPT/Gemini style); the app shows the real sources below.
_INLINE_CITE_RE = re.compile(
    r"\s*\[\s*(?:sources?|web|refs?|citations?)?\s*\d+(?:\s*[,&]\s*\d+)*\s*\]",
    re.IGNORECASE,
)


def strip_image_phrases(text: str) -> str:
    if not text:
        return text
    text = _INLINE_CITE_RE.sub("", text)
    for pat, repl in _IMG_PATTERNS:
        text = pat.sub(repl, text)
    for pat, repl in _CLEANUP:
        text = pat.sub(repl, text)
    # Re-capitalise sentence starts that a removed lead-in clause left lowercase.
    text = _RECAP.sub(lambda m: m.group(1) + m.group(2).upper(), text)
    return text


def strip_reference_section(text: str) -> str:
    """Remove a trailing Sources/References section from a complete answer."""
    if not text:
        return text
    m = _REF_HEADER_RE.search(text)
    if m:
        text = text[: m.start()]
    text = _TRAILING_RULE_RE.sub("", text)
    return text.rstrip()


def sanitize_answer(text: str) -> str:
    return strip_image_phrases(strip_reference_section(text))


_SENT_BOUNDARY = re.compile(r"[.!?]['\")\]]?\s|\n\n")


class StreamFilter:
    """Incrementally sanitises a streamed answer. Emits completed sentences so
    the phrase regexes run on stable text; cuts everything from a references
    header onward."""

    def __init__(self) -> None:
        self._buf = ""
        self._cut = False

    def feed(self, chunk: str) -> str:
        if self._cut:
            return ""
        self._buf += chunk
        # Cut at a references header if one has appeared.
        m = _REF_HEADER_RE.search(self._buf)
        if m:
            out = self._buf[: m.start()]
            self._buf = ""
            self._cut = True
            return strip_image_phrases(_TRAILING_RULE_RE.sub("", out))
        # Emit up to the last completed sentence boundary; keep the rest buffered.
        last = None
        for mb in _SENT_BOUNDARY.finditer(self._buf):
            last = mb.end()
        if last:
            ready, self._buf = self._buf[:last], self._buf[last:]
            return strip_image_phrases(ready)
        return ""

    def flush(self) -> str:
        if self._cut:
            return ""
        m = _REF_HEADER_RE.search(self._buf)
        out = self._buf[: m.start()] if m else self._buf
        self._buf = ""
        self._cut = True
        return strip_image_phrases(_TRAILING_RULE_RE.sub("", out))
