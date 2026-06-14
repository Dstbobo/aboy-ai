"""Strip model-written reference/source lists from answers.

The app renders the REAL retrieved citations as separate cards. Any
"Sources"/"References" list the model writes in the prose is redundant and is
the only place fabricated references (e.g. textbooks/guidelines not in the RAG
context) can appear. We remove that section deterministically — both for whole
answers (non-streaming) and incrementally during streaming.
"""

from __future__ import annotations

import re

# A heading that starts a references/sources block: optional markdown heading
# (#), bold (**), or a bare label, followed by the keyword and end-of-line.
_REF_HEADER_RE = re.compile(
    r"(?:^|\n)[ \t]*"
    r"(?:#{1,6}[ \t]*|\*{1,3}[ \t]*|_{1,3}[ \t]*)?"
    r"(?:sources|references|citations|bibliography|works\s+cited|further\s+reading)"
    r"[ \t]*:?[ \t]*(?:\*{1,3}|_{1,3})?[ \t]*(?:\n|$)",
    re.IGNORECASE,
)

# A trailing markdown horizontal rule / separator left dangling before the cut.
_TRAILING_RULE_RE = re.compile(r"(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$")


def strip_reference_section(text: str) -> str:
    """Remove a trailing Sources/References section from a complete answer."""
    if not text:
        return text
    m = _REF_HEADER_RE.search(text)
    if m:
        text = text[: m.start()]
    text = _TRAILING_RULE_RE.sub("", text)
    return text.rstrip()


class RefSuppressor:
    """Incrementally filters a token stream, cutting everything from the first
    references/sources header onward. Holds back a small tail so a header split
    across chunk boundaries is detected before any of it is emitted."""

    _HOLDBACK = 32

    def __init__(self) -> None:
        self._full = ""
        self._emitted = 0
        self._cut = False

    def feed(self, chunk: str) -> str:
        if self._cut:
            return ""
        self._full += chunk
        m = _REF_HEADER_RE.search(self._full, max(0, self._emitted - self._HOLDBACK))
        if m:
            out = self._full[self._emitted : m.start()]
            self._emitted = len(self._full)
            self._cut = True
            return _TRAILING_RULE_RE.sub("", out)
        # Emit everything except a small trailing holdback (a header may be forming).
        safe = max(self._emitted, len(self._full) - self._HOLDBACK)
        out = self._full[self._emitted : safe]
        self._emitted = safe
        return out

    def flush(self) -> str:
        if self._cut:
            return ""
        m = _REF_HEADER_RE.search(self._full, max(0, self._emitted - self._HOLDBACK))
        end = m.start() if m else len(self._full)
        out = self._full[self._emitted : end]
        self._emitted = len(self._full)
        self._cut = True
        return _TRAILING_RULE_RE.sub("", out)
