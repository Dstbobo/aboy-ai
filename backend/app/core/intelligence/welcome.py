"""Intelligent welcome-back screen + personalised quick-action cards.

Pure functions over a profile dict so they're easy to test and contain no I/O.
"""

from __future__ import annotations

from datetime import datetime, timezone


def _parse(ts):
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def time_greeting(name: str, hour: int) -> str:
    if 5 <= hour < 12:
        return f"Good morning, {name}"
    if 12 <= hour < 17:
        return f"Good afternoon, {name}"
    if 17 <= hour < 21:
        return f"Good evening, {name}"
    return f"Still up, {name}?"


def away_message(profile: dict | None) -> str:
    """Sub-headline under the greeting. The NAME is intentionally omitted here —
    it already appears in the greeting, so repeating it reads as automated.
    Dynamic: a longer, conversational resume prompt when they've been away a
    while; a short, simple line when they were active recently."""
    last = _parse(profile.get("last_active_at")) if profile else None
    last_topic = (profile or {}).get("last_topic")
    if last is None:
        return "Welcome to Aboy — let's get started."
    hours = (datetime.now(timezone.utc) - last).total_seconds() / 3600
    # ── Been a while → longer, conversational nudge to resume ──
    if hours > 72:
        return (f"It's been a while — want to pick up where you left off with {last_topic}?"
                if last_topic else "It's been a while. Let's get back on track.")
    if hours > 24:
        return (f"Let's continue with {last_topic}, right where you left off."
                if last_topic else "Let's pick up where you left off.")
    # ── Active recently → short and simple ──
    return "Ready to continue?"


def progress_message(profile: dict | None) -> str | None:
    if not profile:
        return None
    streak = profile.get("current_streak") or 0
    weak = profile.get("weak_areas") or []
    last_topic = profile.get("last_topic")
    if streak >= 2:
        return f"You're on a {streak} day streak. Keep it going."
    if weak:
        return f"You're making progress in {weak[0]} — let's keep working on it"
    if last_topic:
        return f"Last time you were working on {last_topic}. Want to continue?"
    return None


def streak_celebration(streak: int) -> str | None:
    milestones = {3: "3 days in a row — you're building a habit!",
                  7: "A full week streak! You're on fire.",
                  14: "14 day streak — incredible consistency.",
                  30: "30 days! You're in a league of your own."}
    return milestones.get(streak)


# ── Quick-action cards ──────────────────────────────────────────────────────
def _card(title, prompt, icon="lightbulb-on-outline", subtitle=""):
    return {"title": title, "subtitle": subtitle, "prompt": prompt, "icon": icon}


def _student_cards(p: dict) -> list[dict]:
    cards: list[dict] = []
    last_topic = p.get("last_topic")
    struggling = [t["topic"] for t in (p.get("topics_struggling") or [])]
    frequent = [t["topic"] for t in (p.get("topics_frequent") or [])]
    weak = p.get("weak_areas") or []
    if last_topic:
        cards.append(_card(f"Continue where you left off: {last_topic}",
                           f"Let's continue studying {last_topic} from where we left off.",
                           "play-circle-outline"))
    if struggling:
        cards.append(_card(f"You struggled with {struggling[0]} last time — go deeper?",
                           f"Explain {struggling[0]} again, more simply and step by step.",
                           "arm-flex-outline"))
    if weak:
        cards.append(_card(f"Your weakest area: {weak[0]} — let's work on it",
                           f"Help me improve my understanding of {weak[0]}. Start with the fundamentals.",
                           "target"))
    if frequent:
        cards.append(_card(f"Quiz me on {frequent[0]}",
                           f"Quiz me with 5 questions on {frequent[0]} to test my understanding.",
                           "head-question-outline"))
    return cards


def _professional_cards(p: dict, role: str) -> list[dict]:
    cards: list[dict] = []
    frequent = [t["topic"] for t in (p.get("topics_frequent") or [])]
    last_topic = p.get("last_topic")
    if role.startswith("pro_pharmacist"):
        return [
            _card("Drug interaction checker", "Check for interactions between two drugs.", "pill"),
            _card("Stock alert: low inventory guidance", "How should I manage and prioritise low-stock medications?", "package-variant"),
            _card("Recent drug approval updates", "What are the most recent notable drug approvals and safety updates?", "newspaper-variant-outline"),
        ]
    if frequent:
        cards.append(_card(f"Quick reference: {frequent[0]}",
                           f"Give me a concise clinical quick-reference on {frequent[0]}.", "book-open-variant"))
    if last_topic:
        cards.append(_card(f"Recent guideline update on {last_topic}",
                           f"Are there any recent guideline updates on {last_topic}?", "update"))
    cards.append(_card("Work through a differential", "Help me work through a differential diagnosis for a case.", "stethoscope"))
    return cards


_OPS_CARDS: dict[str, list[dict]] = {
    "ops_cashier": [
        _card("Common billing query: insurance claims", "Walk me through processing an insurance claim.", "file-document-outline"),
        _card("Outstanding balance check", "How do I check and follow up on an outstanding patient balance?", "cash-multiple"),
        _card("Daily reconciliation guide", "Give me a step-by-step daily cash reconciliation guide.", "calculator-variant-outline"),
    ],
    "ops_receptionist": [
        _card("Busy day — appointment management tips", "Give me tips for managing appointments on a busy day.", "calendar-clock"),
        _card("Doctor availability quick check", "How do I quickly check doctor availability and book a patient in?", "doctor"),
        _card("Patient wait time guide", "How do I manage and communicate patient wait times?", "timer-sand"),
    ],
    "ops_ward_manager": [
        _card("Bed management overview", "Give me a bed management and capacity overview approach.", "bed-outline"),
        _card("Shift handover summary guide", "Help me prepare a clear shift handover summary.", "swap-horizontal"),
        _card("Staffing query help", "Help me resolve a staffing and rota query.", "account-group-outline"),
    ],
}


def _ops_cards(role: str) -> list[dict]:
    for key, cards in _OPS_CARDS.items():
        if role.startswith(key):
            return cards
    # Generic operations fallback.
    return [
        _card("Draft a professional memo", "Help me draft a professional memo.", "email-outline"),
        _card("Explain a medical term simply", "Explain a medical term in simple language.", "translate"),
        _card("Incident report help", "Help me write a clear incident report.", "clipboard-alert-outline"),
    ]


def quick_action_cards(profile: dict | None, role: str) -> list[dict]:
    p = profile or {}
    if role.startswith("student_") or role == "educator" or role.startswith("edu_"):
        cards = _student_cards(p)
    elif role.startswith("pro_"):
        cards = _professional_cards(p, role)
    elif role.startswith("ops_"):
        return _ops_cards(role)[:4]
    else:
        cards = _student_cards(p)

    # Fallback so a brand-new user with no history still sees useful cards.
    if not cards:
        cards = [
            _card("Explain a tricky concept", "Explain a concept I'm finding tricky, simply.", "lightbulb-on-outline"),
            _card("Quiz me", "Quiz me with 5 questions on a core topic in my field.", "head-question-outline"),
            _card("Summarise a guideline", "Summarise an important guideline in my field.", "book-open-variant"),
        ]
    return cards[:4]


def build_welcome(profile: dict | None, name: str, role: str, hour: int) -> dict:
    streak = (profile or {}).get("current_streak") or 0
    return {
        "greeting": time_greeting(name or "there", hour),
        "message": away_message(profile),
        "progress": progress_message(profile),
        "streak": streak,
        "longest_streak": (profile or {}).get("longest_streak") or 0,
        "celebration": streak_celebration(streak),
        "last_topic": (profile or {}).get("last_topic"),
        "cards": quick_action_cards(profile, role),
    }
