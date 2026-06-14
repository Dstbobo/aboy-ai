"""Topic extraction + follow-up detection for the learning-intelligence layer.

Keyword-driven (fast, free, deterministic) and covers BOTH clinical roles and
non-clinical hospital staff so every person gets a profile that feels built
for them.
"""

from __future__ import annotations

import re

# Clinical / study topics (mirrors the mobile progress store).
_CLINICAL: dict[str, list[str]] = {
    "Cardiology": ["heart", "cardiac", "hypertension", "blood pressure", "ecg", "arrhythmia", "myocardial", "angina", "heart failure"],
    "Respiratory": ["lung", "asthma", "copd", "pneumonia", "respiratory", "oxygen", "ventilation", "tuberculosis"],
    "Neurology": ["brain", "stroke", "seizure", "epilepsy", "neuro", "headache", "migraine", "parkinson"],
    "Endocrinology": ["diabetes", "insulin", "thyroid", "hormone", "glucose", "endocrine"],
    "Infectious Disease": ["infection", "sepsis", "antibiotic", "malaria", "hiv", "virus", "bacteria", "fever"],
    "Gastroenterology": ["liver", "stomach", "ulcer", "gastro", "bowel", "hepatitis", "pancrea"],
    "Renal": ["kidney", "renal", "dialysis", "urinary", "nephro"],
    "Obstetrics & Gynecology": ["pregnan", "labour", "labor", "birth", "obstetric", "gynec", "menstrual", "antenatal"],
    "Pediatrics": ["child", "pediatric", "paediatric", "infant", "neonat", "vaccine"],
    "Pharmacology": ["drug", "dose", "dosage", "medication", "pharmac", "side effect", "interaction"],
    "Hematology": ["blood", "anemia", "anaemia", "clot", "transfusion", "sickle"],
    "Mental Health": ["depression", "anxiety", "psychiatric", "mental", "schizo", "bipolar"],
    "Musculoskeletal": ["bone", "fracture", "joint", "muscle", "arthritis", "ortho"],
    "Oncology": ["cancer", "tumor", "tumour", "oncolog", "chemo", "malignan"],
    "Emergency Medicine": ["emergency", "trauma", "resuscitation", "cpr", "triage", "shock"],
}

# Non-clinical / operations topics so cashiers, receptionists, ward managers etc
# also build a meaningful profile.
_OPERATIONS: dict[str, list[str]] = {
    "Billing & Claims": ["bill", "invoice", "claim", "insurance", "payment", "reconcil", "balance", "refund", "copay"],
    "Appointments": ["appointment", "booking", "schedul", "reschedul", "wait time", "queue", "availability"],
    "Patient Records": ["record", "registration", "admission", "discharge", "patient file", "intake"],
    "Bed Management": ["bed", "ward occupancy", "capacity", "transfer", "bed management"],
    "Staffing & Rota": ["staffing", "rota", "shift", "handover", "roster", "leave", "overtime"],
    "Inventory & Stock": ["stock", "inventory", "supply", "reorder", "low inventory", "expiry"],
    "Equipment": ["equipment", "device", "machine", "maintenance", "calibration"],
    "Compliance & Reports": ["incident report", "compliance", "audit", "memo", "policy", "protocol"],
}

# Phrases that signal the user is struggling with the previous answer.
_FOLLOWUP_PHRASES = re.compile(
    r"\b(explain again|don'?t understand|didn'?t understand|confused|simpler|simplify|"
    r"what do you mean|elaborate|clarify|still (?:not |un)clear|repeat|rephrase|"
    r"break (?:it|this) down|i'?m lost|too complex|too complicated|in simple terms)\b",
    re.IGNORECASE,
)


def extract_topics(text: str, role: str = "") -> list[str]:
    """Return the topics a question touches (clinical for clinicians, ops for staff)."""
    low = text.lower()
    sources = [_CLINICAL, _OPERATIONS]
    hits: list[str] = []
    for table in sources:
        for topic, words in table.items():
            if any(w in low for w in words):
                hits.append(topic)
    return hits


def is_followup(text: str, prev_topics: list[str], cur_topics: list[str]) -> bool:
    """A query is a follow-up/struggle signal if it asks for clarification, or
    continues the same topic as the immediately prior question in the session."""
    if _FOLLOWUP_PHRASES.search(text):
        return True
    return bool(prev_topics) and bool(set(prev_topics) & set(cur_topics))
