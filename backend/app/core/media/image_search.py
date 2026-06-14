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
from urllib.parse import quote

import httpx

from app.core.cache import cache_get, cache_set
from app.db.supabase import get_db

logger = logging.getLogger(__name__)

# Wikimedia asks every API client to send a descriptive User-Agent.
_UA = "AboyAI/1.0 (https://aboyai.com; medical education) httpx"
_COMMONS = "https://commons.wikimedia.org/w/api.php"
_PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name"
_TIMEOUT = 5.0

# Image illustrations for a concept never change, so cache aggressively.
# A successful lookup is reused for 30 days; a miss is remembered for 1 day
# so we don't hammer the upstream APIs for concepts that have no image.
_TTL_HIT = 30 * 24 * 60 * 60
_TTL_MISS = 24 * 60 * 60
# Bump to invalidate stale Redis image entries (non-English / low-res variants).
_CACHE_VERSION = "v3"

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

# Common drugs (helps reliably extract the compound name for PubChem).
_KNOWN_DRUGS = {
    "metformin", "insulin", "aspirin", "paracetamol", "acetaminophen", "ibuprofen",
    "amoxicillin", "ceftriaxone", "azithromycin", "warfarin", "heparin", "atorvastatin",
    "simvastatin", "lisinopril", "ramipril", "amlodipine", "losartan", "metoprolol",
    "bisoprolol", "furosemide", "spironolactone", "omeprazole", "pantoprazole",
    "salbutamol", "albuterol", "prednisolone", "prednisone", "hydrocortisone",
    "morphine", "codeine", "tramadol", "diazepam", "lorazepam", "haloperidol",
    "levothyroxine", "digoxin", "clopidogrel", "gentamicin", "ciprofloxacin",
    "vancomycin", "paclitaxel", "methotrexate", "caffeine", "penicillin",
    "amiodarone", "gabapentin", "sertraline", "fluoxetine", "diclofenac",
}
_DRUG_SUFFIX = re.compile(
    r"\b([a-z]{5,}(?:in|ol|ide|one|ine|am|pril|sartan|cillin|mycin|statin|azole|pam))\b"
)
_STRUCTURE_INTENT = re.compile(r"chemical structure|molecular structure|\bstructure of\b")

# Sentinel prefix routing a query to the PubChem structure API instead of Commons.
_PUBCHEM_TAG = "pubchem:"


def _extract_drug(q: str) -> str | None:
    for d in _KNOWN_DRUGS:
        if re.search(rf"\b{d}\b", q):
            return d
    m = _DRUG_SUFFIX.search(q)
    return m.group(1) if m else None


def detect_visual_query(question: str, role: str) -> str | None:
    """Return a search query if the question is visual, else None.

    Drug-structure questions return a ``pubchem:<drug>`` marker so the exact
    molecular structure is fetched from PubChem; everything else returns a
    Wikimedia Commons search string.
    """
    q = question.lower()

    # Any role asking for a drug's chemical structure → PubChem structure PNG.
    pharmacist = role.startswith("pro_pharmacist")
    if _STRUCTURE_INTENT.search(q) or (pharmacist and re.search(r"\bmoa\b|mechanism|molecul", q)):
        drug = _extract_drug(q)
        if drug:
            return f"{_PUBCHEM_TAG}{drug}"

    for pattern, query in _CONCEPTS:
        if re.search(pattern, q):
            return query
    return None


_HTML_TAG = re.compile(r"<[^>]+>")

# Wikimedia hosts the same diagram translated into many languages as separate
# files, often suffixed with a language code (e.g. "Physiology of Nephron ku").
# We must always prefer the English version, never a foreign-labelled one.
_FOREIGN_LANG_CODES = {
    "ar", "az", "fa", "ku", "ru", "tr", "fr", "de", "es", "it", "pt", "zh",
    "ja", "ko", "hi", "ur", "bn", "id", "pl", "nl", "sv", "fi", "cs", "ro",
    "hu", "el", "he", "th", "vi", "uk", "sr", "hr", "bg", "sk", "sl", "lt",
    "lv", "et", "ka", "hy", "ms", "ta", "te", "ml", "kn", "mr", "gu", "pa",
    "ne", "si", "my", "km", "lo", "mn", "kk", "uz", "be", "mk", "sq", "bs",
    "ca", "gl", "eu", "af", "sw", "am", "ha", "yo", "ig", "zu", "tl", "ckb",
    # ISO 639-2 (3-letter) variants seen on Commons filenames.
    "rus", "ara", "fas", "kur", "tur", "fra", "deu", "ger", "spa", "ita",
    "por", "zho", "chi", "jpn", "kor", "hin", "urd", "ben", "ind", "pol",
    "nld", "dut", "swe", "fin", "ces", "cze", "ron", "rum", "hun", "ell",
    "gre", "heb", "tha", "vie", "ukr", "srp", "hrv", "bul", "slk", "slo",
    "slv", "lit", "lav", "est", "kat", "geo", "hye", "arm", "msa", "may",
    "tam", "tel", "mal", "kan", "mar", "guj", "pan", "nep", "sin", "mya",
    "khm", "lao", "mon", "kaz", "uzb", "bel", "mkd", "sqi", "alb", "bos",
    "cat", "glg", "eus", "baq", "afr", "swa", "amh", "hau", "yor", "ibo",
    "zul", "tgl", "fil",
}
_EN_MARKER = re.compile(r"(?:[ _\-(](?:en|eng|english)\b|\benglish\b)", re.IGNORECASE)
_TRAILING_LANG = re.compile(r"[ _\-]([a-z]{2,4})$", re.IGNORECASE)


def _english_score(title_base: str) -> int:
    """Higher = more likely English. Penalise foreign-language file variants."""
    t = (title_base or "").strip()
    if _EN_MARKER.search(t):
        return 2
    m = _TRAILING_LANG.search(t)
    if m and m.group(1).lower() in _FOREIGN_LANG_CODES:
        return -3
    return 0


def _clean(text: str, limit: int = 90) -> str:
    text = _HTML_TAG.sub("", text or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit].rstrip(" .,") if text else ""


async def _image_loads(url: str) -> bool:
    """True only if the URL returns a real, non-trivial image. We verify before
    storing/returning so the app never receives a URL that will fail to render."""
    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT, headers={"User-Agent": _UA}, follow_redirects=True
        ) as client:
            resp = await client.get(url)
        return (
            resp.status_code == 200
            and resp.headers.get("content-type", "").startswith("image/")
            and len(resp.content) > 1024
        )
    except Exception:
        return False


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
        # 1600px so anatomical labels are sharp and readable (900 was blurry).
        "iiurlwidth": "1600",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": _UA}) as client:
        resp = await client.get(_COMMONS, params=params)
    if resp.status_code != 200:
        return None
    pages = (resp.json().get("query") or {}).get("pages") or {}
    candidates = []
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("mime", "") not in ("image/jpeg", "image/png"):
            continue
        thumb = info.get("thumburl")
        if not thumb:
            continue
        file_base = page.get("title", "").removeprefix("File:").rsplit(".", 1)[0]
        meta = info.get("extmetadata") or {}
        title = (
            _clean(meta.get("ObjectName", {}).get("value", ""))
            or _clean(meta.get("ImageDescription", {}).get("value", ""))
            or _clean(file_base)
        )
        # Prefer English: score the filename AND the human title.
        en = _english_score(file_base) + _english_score(title)
        candidates.append((
            en, -page.get("index", 999),  # English first, then search rank
            {"url": thumb, "title": title or "Medical illustration",
             "source": "Wikimedia Commons", "page_url": info.get("descriptionurl") or ""},
        ))
    if not candidates:
        return None
    # Highest English score, then best (lowest) search index.
    candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    # Return the first candidate that actually loads (verified), so the app
    # never receives a dead URL. Check a few in case the top one is broken.
    for _, _, img in candidates[:5]:
        if await _image_loads(img["url"]):
            return img
    return None


async def _pubchem_structure(drug: str) -> dict | None:
    """Exact 2D chemical structure PNG for a drug, via PubChem (verified by CID)."""
    name = quote(drug)
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": _UA}) as client:
        cid_resp = await client.get(f"{_PUBCHEM}/{name}/cids/JSON")
    if cid_resp.status_code != 200:
        return None
    cids = (cid_resp.json().get("IdentifierList") or {}).get("CID") or []
    if not cids:
        return None
    cid = cids[0]
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/PNG?image_size=large"
    if not await _image_loads(url):
        return None
    return {
        "url": url,
        "title": f"{drug.capitalize()} - chemical structure",
        "source": "PubChem",
        "page_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
    }


async def _live_lookup(query: str) -> dict | None:
    if query.startswith(_PUBCHEM_TAG):
        return await _pubchem_structure(query[len(_PUBCHEM_TAG):])
    return await _commons_search(query)


async def _db_get(concept: str) -> dict | None | bool:
    """Read a pre-fetched image from the DB.

    Returns the image dict (hit), {} (known miss), or None (not in DB yet).
    """
    try:
        db = await get_db()
        res = await db.table("medical_images").select("*").eq("concept", concept).maybe_single().execute()
        if res and res.data:
            row = res.data
            if not row.get("found"):
                return {}
            return {
                "url": row["url"], "title": row.get("title") or "Medical illustration",
                "source": row.get("source") or "", "page_url": row.get("page_url") or "",
            }
    except Exception as exc:
        logger.warning("medical_images read failed: %s", exc)
    return None


async def _db_put(concept: str, image: dict | None) -> None:
    try:
        db = await get_db()
        row = {"concept": concept, "found": bool(image), "updated_at": "now()"}
        if image:
            row.update({"url": image["url"], "title": image.get("title"),
                        "source": image.get("source"), "page_url": image.get("page_url")})
        await db.table("medical_images").upsert(row).execute()
    except Exception as exc:
        logger.warning("medical_images write failed: %s", exc)


async def resolve_concept(concept: str, *, allow_live: bool = True) -> dict | None:
    """Return an image for a detector concept: DB first, then (optionally) a
    live fetch that is stored back into the DB so it is instant next time."""
    # L1: Redis (fast path for hot concepts).
    cache_key = f"img:{_CACHE_VERSION}:{concept}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached or None

    # L2: pre-fetched DB row (source of truth — reliable, no upstream call).
    db_hit = await _db_get(concept)
    if db_hit is not None:
        image = db_hit or None
        await cache_set(cache_key, image or {}, _TTL_HIT if image else _TTL_MISS)
        return image

    if not allow_live:
        return None

    # L3: live fetch, then persist to DB + Redis so it's reliable from now on.
    try:
        image = await _live_lookup(concept)
    except Exception as exc:
        logger.warning("IMAGE live lookup failed for %r: %s", concept, exc)
        return None  # transient — don't persist a miss, allow a retry
    await _db_put(concept, image)
    await cache_set(cache_key, image or {}, _TTL_HIT if image else _TTL_MISS)
    if image:
        logger.info("IMAGE live->DB %.40s -> %s", concept, image["title"])
    return image


async def find_medical_image(question: str, role: str) -> dict | None:
    """Detect a visual medical concept and return one illustration, or None.

    Lookup order: Redis → pre-fetched `medical_images` DB table → live fetch
    (Wikimedia/PubChem) which is then stored in the DB for instant reuse.
    """
    query = detect_visual_query(question, role)
    if not query:
        return None
    return await resolve_concept(query)


def all_prefetch_concepts() -> list[str]:
    """Every concept the detector can produce — used to pre-populate the DB."""
    concepts = [q for _, q in _CONCEPTS]
    concepts += [f"{_PUBCHEM_TAG}{d}" for d in sorted(_KNOWN_DRUGS)]
    # De-dupe, preserve order.
    seen, out = set(), []
    for c in concepts:
        if c not in seen:
            seen.add(c); out.append(c)
    return out
