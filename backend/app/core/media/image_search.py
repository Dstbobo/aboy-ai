"""Automatic medical illustration lookup.

When a question involves a *visual* medical concept (anatomy, an ECG, a
histology slide, a drug structure, …) we attach a real illustration from a
verified free source so the text answer is paired with a picture — the user
never has to ask. Detection is keyword-driven (fast, free, deterministic — no
extra LLM tokens) and role-aware; image retrieval uses the keyless Wikimedia
Commons API. If nothing relevant is found we return None and the caller simply
shows no image (never a broken one).
"""

from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger(__name__)

# Wikimedia asks every API client to send a descriptive User-Agent.
_UA = "AboyAI/1.0 (https://aboyai.com; medical education) httpx"
_COMMONS = "https://commons.wikimedia.org/w/api.php"
_TIMEOUT = 5.0

# ── Visual-concept detection ───────────────────────────────────────────────
# Each entry: a trigger (matched as a whole word, case-insensitive) → the search
# query used to find an illustration. Ordered roughly specific → general; the
# FIRST match wins, so multi-word/specific concepts are listed before organs.
_CONCEPTS: list[tuple[str, str]] = [
    # Clinical findings / imaging
    (r"\be(?:cg|kg)\b", "ECG electrocardiogram strip"),
    (r"\belectrocardiogra", "ECG electrocardiogram strip"),
    (r"\bchest x-?ray\b", "chest x-ray radiograph"),
    (r"\bx-?ray\b", "x-ray radiograph"),
    (r"\bct scan\b|\bcomputed tomograph", "CT scan medical"),
    (r"\bmri\b|magnetic resonance", "MRI scan medical"),
    (r"\bultrasound\b|\bsonograph", "medical ultrasound scan"),
    (r"\bechocardiogra", "echocardiogram"),
    # Microscopy / lab
    (r"\bgram stain\b", "gram stain microscopy"),
    (r"\bblood smear\b|\bperipheral smear\b", "blood smear microscopy"),
    (r"\bhistolog|\bmicroscop", "histology microscopy slide"),
    (r"\bbacteri|\bstaphylococc|\bstreptococc|\be\.? coli\b", "bacteria microscopy"),
    (r"\bmalaria\b", "malaria parasite blood smear"),
    (r"\bcell cycle\b", "cell cycle diagram"),
    (r"\bmitosis\b", "mitosis diagram"),
    (r"\bneuron\b|\bnerve cell\b", "neuron structure diagram"),
    (r"\bnephron\b", "nephron diagram"),
    (r"\balveol", "alveoli lung diagram"),
    # Body systems
    (r"cardiovascular system|circulatory system", "cardiovascular system diagram"),
    (r"respiratory system", "respiratory system diagram"),
    (r"nervous system", "nervous system diagram"),
    (r"digestive system|gastrointestinal", "digestive system diagram"),
    (r"urinary system|renal system", "urinary system diagram"),
    (r"endocrine system", "endocrine system diagram"),
    (r"lymphatic system|immune system", "lymphatic system diagram"),
    (r"skeletal system", "human skeleton diagram"),
    (r"muscular system", "muscular system diagram"),
    (r"reproductive system", "reproductive system anatomy diagram"),
    # Physiology processes
    (r"cardiac cycle", "cardiac cycle diagram"),
    (r"action potential", "action potential diagram"),
    (r"cardiac conduction|conduction system", "cardiac conduction system diagram"),
    # Organs / anatomy
    (r"\bheart\b", "human heart anatomy diagram"),
    (r"\blungs?\b", "human lungs anatomy diagram"),
    (r"\bbrain\b", "human brain anatomy diagram"),
    (r"\bkidneys?\b", "kidney anatomy diagram"),
    (r"\bliver\b", "liver anatomy diagram"),
    (r"\bstomach\b", "stomach anatomy diagram"),
    (r"\bpancreas\b", "pancreas anatomy diagram"),
    (r"\bspleen\b", "spleen anatomy diagram"),
    (r"\bintestin|\bbowel\b|\bcolon\b", "intestine anatomy diagram"),
    (r"\bthyroid\b", "thyroid gland anatomy diagram"),
    (r"\bskin\b|\bdermis\b|\bepiderm", "skin layers anatomy diagram"),
    (r"\beye\b|\bretina\b|\bocular\b", "human eye anatomy diagram"),
    (r"\bears?\b|\bcochlea\b", "human ear anatomy diagram"),
    (r"\bspinal cord\b|\bvertebr", "spinal cord anatomy diagram"),
    (r"\bbones?\b|\bskeleton\b|\bfemur\b|\bskull\b", "human skeleton anatomy diagram"),
    (r"\bmuscles?\b", "human muscle anatomy diagram"),
    (r"\bbrachial plexus\b", "brachial plexus diagram"),
    # Equipment / devices / procedures
    (r"\bventilator\b", "mechanical ventilator medical equipment"),
    (r"\bdefibrillator\b", "defibrillator medical equipment"),
    (r"\bstethoscope\b", "stethoscope"),
    (r"\bsyringe\b|\bcannula\b|\bcatheter\b", "medical catheter equipment"),
    (r"\bsuture\b|\bsuturing\b", "surgical suture technique"),
    (r"\bintubation\b", "endotracheal intubation"),
]

# Role-specific suffix nudges (applied on top of the matched concept query).
_ROLE_BIAS: dict[str, str] = {
    "pro_pharmacist": "",
    "ops_": "",
}


def detect_visual_query(question: str, role: str) -> str | None:
    """Return a Wikimedia search query if the question is visual, else None."""
    q = question.lower()

    # Pharmacists asking about a drug → prefer a molecular structure image.
    if role.startswith("pro_pharmacist") and re.search(
        r"structure|mechanism|moa|molecul", q
    ):
        m = re.search(r"\b([a-z]{4,}(?:in|ol|ide|one|am|pril|sartan|cillin|mycin))\b", q)
        if m:
            return f"{m.group(1)} chemical structure"

    for pattern, query in _CONCEPTS:
        if re.search(pattern, q):
            return query
    return None


_HTML_TAG = re.compile(r"<[^>]+>")


def _clean(text: str, limit: int = 90) -> str:
    text = _HTML_TAG.sub("", text or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit].rstrip(" .,") if text else ""


async def _commons_search(query: str) -> dict | None:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": "6",  # File:
        "gsrlimit": "8",
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": "900",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": _UA}) as client:
        resp = await client.get(_COMMONS, params=params)
    if resp.status_code != 200:
        return None
    pages = (resp.json().get("query") or {}).get("pages") or {}
    # Search results carry an "index" — honour it so the best match ranks first.
    ordered = sorted(pages.values(), key=lambda p: p.get("index", 999))
    for page in ordered:
        info = (page.get("imageinfo") or [{}])[0]
        mime = info.get("mime", "")
        if mime not in ("image/jpeg", "image/png"):
            continue
        thumb = info.get("thumburl")
        if not thumb:
            continue
        meta = info.get("extmetadata") or {}
        title = (
            _clean(meta.get("ObjectName", {}).get("value", ""))
            or _clean(meta.get("ImageDescription", {}).get("value", ""))
            or _clean(page.get("title", "").removeprefix("File:").rsplit(".", 1)[0])
        )
        return {
            "url": thumb,
            "title": title or "Medical illustration",
            "source": "Wikimedia Commons",
            "page_url": info.get("descriptionurl") or "",
        }
    return None


async def find_medical_image(question: str, role: str) -> dict | None:
    """Detect a visual medical concept and return one illustration, or None."""
    query = detect_visual_query(question, role)
    if not query:
        return None
    try:
        image = await _commons_search(query)
        if image:
            logger.info("IMAGE match q=%.40s -> %s", question, image["title"])
        return image
    except Exception as exc:  # never let image lookup break a response
        logger.warning("IMAGE lookup failed: %s", exc)
        return None
