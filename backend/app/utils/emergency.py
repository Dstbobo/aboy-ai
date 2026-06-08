EMERGENCY_KEYWORDS = [
    "suicide", "self harm", "self-harm", "overdose", "poisoning",
    "anaphylaxis", "chest pain", "heart attack", "stroke",
    "cant breathe", "can't breathe", "not breathing",
    "severe bleeding", "unconscious", "seizure",
    "pediatric emergency", "child not breathing",
]

_EMERGENCY_SET = {kw.lower() for kw in EMERGENCY_KEYWORDS}


def check_emergency(query: str) -> bool:
    """Return True if query contains any emergency keyword. Must run under 10ms."""
    lowered = query.lower()
    return any(kw in lowered for kw in _EMERGENCY_SET)


EMERGENCY_RESOURCES = {
    "global": {
        "WHO Emergency": "https://www.who.int/emergencies",
        "Poison Control (US)": "1-800-222-1222",
    },
    "crisis": {
        "International Suicide Hotlines": "https://www.iasp.info/resources/Crisis_Centres/",
    },
}
