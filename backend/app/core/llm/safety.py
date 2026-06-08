BLOCKED_PATTERNS = [
    "i am not an ai",
    "ignore previous instructions",
    "forget your instructions",
    "act as a human",
    "jailbreak",
    "dan mode",
]


def is_safe_output(text: str) -> bool:
    lowered = text.lower()
    return not any(p in lowered for p in BLOCKED_PATTERNS)
