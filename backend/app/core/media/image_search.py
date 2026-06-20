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

import asyncio
import logging
import re
from urllib.parse import quote, urlparse

import httpx

from app.core.cache import cache_get, cache_set, query_hash
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
# Web-image misses are kept only briefly so a transient empty result (slow load,
# blocked host, momentary Tavily gap) retries soon instead of staying blank.
_TTL_IMGS_MISS = 20 * 60
# Bump to invalidate stale Redis image entries (non-English / low-res variants).
_CACHE_VERSION = "v8"

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
    # Reproductive anatomy (educational human diagrams; 'human' keeps the
    # Wikimedia results on people, not insect/animal reproductive anatomy).
    (r"\bvagina\w*|\bvulva\w*|\bcervix\b|\bcervical canal\b", "human female reproductive system anatomy"),
    (r"\buterus\b|\buterine\b|\bwomb\b|\bendometri\w*|\bfallopian\b|\bovar(?:y|ies)\b", "human female reproductive system anatomy"),
    (r"\bpenis\w*|\btestis\b|\btestes\b|\btesticl\w*|\bscrotum\b|\bprostate\b|\bepididym\w*", "human male reproductive system anatomy"),
    (r"\bbreast\w*|\bmammary\b", "human breast anatomy diagram"),
    (r"\bplacenta\w*|\bfetus\b|\bfoetus\b|\bumbilical cord\b", "human placenta fetus anatomy diagram"),
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


# Broad "is this a visual/structural topic?" check — used to trigger the Tier B
# labelled-breakdown answer even for concepts we have no curated image for
# (e.g. "lymph node structure"), so gaps still read like a textbook figure.
_VISUAL_TOPIC_RE = re.compile(
    r"\b(?:anatomy|anatomical|structures?|layers?|cross[- ]?section|histolog\w*|"
    r"morpholog\w*|labell?ed|diagram|parts of|components of|stages? of|steps? of|"
    r"phases? of|pathway|cycle|what (?:does|do) .* look like|draw|illustrat\w*)\b",
    re.IGNORECASE,
)


def is_visual_question(question: str, role: str = "") -> bool:
    """True if the question is about a visual/structural topic (curated concept
    OR broad anatomical/structural intent)."""
    if detect_visual_query(question, role):
        return True
    return bool(_VISUAL_TOPIC_RE.search(question))


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

# Exclude diagrams that have number-only labels, no labels, or mixed-language
# labels — students need readable English text labels on the diagram.
_BANNED_IMAGE = re.compile(
    r"num\s*label|numbered|un\s*label|no[ _\-]?labels?|no[ _\-]?text|"
    r"without[ _\-]?labels?|\bblank\b|multi\s*lingual|multilanguage",
    re.IGNORECASE,
)
_TRAILING_LANG = re.compile(r"[ _\-]([a-z]{2,4})$", re.IGNORECASE)


# Relevance: the chosen image must actually depict the concept, not just be a
# sharp image that loosely matched. Match the concept's key term(s) (with a few
# anatomical synonyms) against the candidate filename/title.
_STOP_WORDS = {
    "human", "anatomy", "anatomical", "diagram", "system", "structure", "of",
    "the", "a", "medical", "gland", "control", "physiology", "labeled",
    "labelled", "drawing", "illustration", "and",
}
_SYNONYMS = {
    "kidney": ["kidney", "renal", "nephron"], "nephron": ["nephron", "kidney", "renal"],
    "heart": ["heart", "cardiac"], "cardiac": ["cardiac", "heart"],
    "brain": ["brain", "cerebral", "cerebrum"], "liver": ["liver", "hepatic"],
    "lung": ["lung", "lungs", "pulmonary", "respiratory"], "lungs": ["lung", "lungs", "pulmonary", "respiratory"],
    "respiratory": ["respiratory", "lung", "lungs", "pulmonary"],
    "bone": ["bone", "skeleton", "skeletal"], "skeleton": ["skeleton", "skeletal", "bone"],
    "stomach": ["stomach", "gastric"], "eye": ["eye", "ocular", "retina"],
    "ear": ["ear", "cochlea", "auditory"], "spinal": ["spinal", "spine", "vertebr"],
    "skin": ["skin", "dermis", "epidermis", "integument"], "thyroid": ["thyroid"],
    "pancreas": ["pancreas", "pancreatic"], "spleen": ["spleen", "splenic"],
    "intestine": ["intestine", "intestinal", "bowel", "colon"], "muscle": ["muscle", "muscular"],
    "neuron": ["neuron", "nerve", "neural"], "alveoli": ["alveoli", "alveolar", "lung"],
}


def _key_terms(query: str) -> set[str]:
    terms: set[str] = set()
    for w in re.findall(r"[a-z]+", query.lower()):
        if len(w) > 2 and w not in _STOP_WORDS:
            terms.add(w)
            terms.update(_SYNONYMS.get(w, []))
    return terms


def _has_term(text: str, terms: set[str]) -> bool:
    if not terms:
        return True
    low = (text or "").lower()
    return any(t in low for t in terms)


def _lang_signal(text: str) -> str:
    """'en' (explicit English marker), 'foreign' (foreign lang code), or 'neutral'."""
    t = (text or "").strip()
    if _EN_MARKER.search(t):
        return "en"
    m = _TRAILING_LANG.search(t)
    if m and m.group(1).lower() in _FOREIGN_LANG_CODES:
        return "foreign"
    return "neutral"


def _english_flags(file_base: str, title: str) -> tuple[int, int]:
    """Returns (not_foreign, en_bonus). not_foreign=0 only when a foreign-language
    marker is present and no English marker is — those are pushed to the bottom.
    en_bonus is a mild tiebreak; neutral (most English diagrams) is treated the
    same as explicit-English so it never loses to a low-res '-en' variant."""
    sigs = {_lang_signal(file_base), _lang_signal(title)}
    has_en = "en" in sigs
    is_foreign = ("foreign" in sigs) and not has_en
    return (0 if is_foreign else 1, 1 if has_en else 0)


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
        # Include SVG ('drawing') as well as bitmap: Wikimedia renders SVGs to a
        # crisp PNG at our requested width, so labelled diagrams stay sharp.
        "gsrsearch": query,
        "gsrnamespace": "6",  # File:
        "gsrlimit": "8",
        "prop": "imageinfo",
        "iiprop": "url|mime|size|extmetadata",  # size → original width/height
        # 1600px so anatomical labels are sharp and readable (900 was blurry).
        "iiurlwidth": "1600",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": _UA}) as client:
        resp = await client.get(_COMMONS, params=params)
    if resp.status_code != 200:
        return None
    pages = (resp.json().get("query") or {}).get("pages") or {}
    terms = _key_terms(query)
    candidates = []
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        mime = info.get("mime", "")
        if mime not in ("image/jpeg", "image/png", "image/svg+xml"):
            continue
        # thumburl is a PNG render at our requested width (sharp, even for SVG).
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
        # Skip number-only / unlabelled diagrams — labels must be readable text.
        if _BANNED_IMAGE.search(f"{file_base} {title}"):
            continue
        not_foreign, en_bonus = _english_flags(file_base, title)
        # Sharpness bucket: SVG is vector (always crisp at 1600px) so rank it
        # highest; otherwise reward higher-resolution rasters.
        width = int(info.get("width") or 0)
        if mime == "image/svg+xml":
            res_bucket = 3
        else:
            res_bucket = 2 if width >= 1400 else 1 if width >= 900 else 0
        # Relevance: does the candidate actually depict the concept?
        relevant = 1 if _has_term(f"{file_base} {title}", terms) else 0
        candidates.append((
            # Avoid foreign, THEN on-topic, THEN explicit English text labels
            # (e.g. "...-en"), THEN sharpest, then search rank. English-labelled
            # is preferred over a sharper unlabelled/number-only variant.
            not_foreign, relevant, en_bonus, res_bucket, -page.get("index", 999),
            {"url": thumb, "title": title or "Medical illustration",
             "source": "Wikimedia Commons", "page_url": info.get("descriptionurl") or ""},
        ))
    if not candidates:
        return None
    candidates.sort(key=lambda c: (c[0], c[1], c[2], c[3], c[4]), reverse=True)
    # Return the first candidate that actually loads (verified), so the app
    # never receives a dead URL. Check a few in case the top one is broken.
    for *_, img in candidates[:5]:
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
            # Not found, or license-incompatible (servable=false) → show nothing.
            if not row.get("found") or row.get("servable") is False:
                return {}
            return {
                "url": row["url"], "title": row.get("title") or "Medical illustration",
                "source": row.get("source") or "", "page_url": row.get("page_url") or "",
                "license": row.get("license") or "", "attribution": row.get("attribution") or "",
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


# Visual intent the detector missed → coverage backlog ("show me X", etc.).
_VISUAL_INTENT = re.compile(
    r"\b(?:show me|what does .* look like|looks? like|diagram of|picture of|"
    r"image of|illustration of|photo of|draw(?:\s+me)?|labell?ed|anatomy of|"
    r"structure of|how does (?:a|an|the)\b|what is (?:a|an|the)\b)\b",
    re.IGNORECASE,
)

# Clinical *appearance* intent — the user wants to see what something looks like
# (a rash, lesion, ulcer, condition), not a generic anatomy diagram. These are
# better served by a real web photo than by the curated anatomy set, so we try
# web image search FIRST for them.
_APPEARANCE_INTENT = re.compile(
    r"\bwhat does .* look like\b|\bappearance of\b|\blooks? like\b|"
    r"\bclinical (?:photo|image|picture|presentation|appearance)\b|"
    r"\b(?:rash|lesion|ulcer|blister|pustule|nodule|plaque|wound)s?\b",
    re.IGNORECASE,
)


async def _log_resolution(concept: str, served: bool) -> None:
    try:
        db = await get_db()
        await db.rpc("bump_resolution_stat", {
            "p_concept": concept, "p_outcome": "served" if served else "no_image",
        }).execute()
    except Exception:
        pass


# ── Source-agnostic image retrieval with ranking ───────────────────────────
# Aboy is NOT tied to Wikimedia. For a visual question it gathers candidates
# from the open web (Tavily — any site) PLUS the curated/learned set, RANKS them
# by relevance + source trust + quality, de-duplicates by domain so references
# come from DIFFERENT places, and returns the best few — each shown with its own
# source link. Winners are persisted so the knowledge base grows with use.
_BAD_IMG_URL = re.compile(
    r"\b(?:logo|icon|sprite|avatar|favicon|placeholder|banner|button|badge|"
    r"pixel|spacer|advert)\b|\.svg$",  # .svg excluded: RN <Image> can't render it
    re.IGNORECASE,
)

# Only hosts that serve NO usable image are skipped — login walls / hotlink-403 /
# HTML pages. Watermarked stock is ALLOWED: we display with a source link and
# never own the image, so a watermark is not a problem.
_BLOCKED_IMG_DOMAINS = (
    "researchgate", "academia.edu", "pinterest", "slideshare", "slideplayer",
    "quizlet", "scribd",
    # Generic diagramming-tool sites — they return template Sankey/sequence/
    # flowchart images that have nothing to do with the medical question.
    "creately", "lucidchart", "lucid.app", "lucid.co", "gliffy", "diagrams.net",
    "draw.io", "drawio", "smartdraw", "conceptdraw", "edrawsoft", "edraw.",
    "visual-paradigm", "miro.com", "canva.", "moqups", "zenflowchart",
    "venngage", "cacoo", "figma.", "diagram.org", "onmail",
)

# Words that carry NO subject meaning — used so relevance is judged on the real
# topic ("reproductive", "ebola"), not on filler like "diagram"/"picture"/"want".
_IMG_GENERIC = _STOP_WORDS | {
    "picture", "pictures", "image", "images", "photo", "photos", "pic", "pics",
    "look", "looks", "looking", "like", "want", "wants", "show", "shows", "see",
    "give", "given", "get", "find", "need", "real", "actual", "diagram", "diagrams",
    "draw", "view", "cross", "section", "what", "how", "does", "is", "are",
    "clinical", "figure", "reference", "please", "labelled", "labeled",
    # Generic verbs/connectors so a study question still searches on its real
    # topic, not on filler ("explain X" → X, "difference between X and Y" → X, Y).
    "explain", "explains", "tell", "about", "more", "define", "definition",
    "mean", "means", "difference", "between", "compare", "versus", "describe",
    "understand", "know", "learn", "study", "help", "can", "you", "this", "that",
    "thank", "thanks", "much", "hello", "hey", "okay", "yes", "good", "great",
}


def _meaningful_terms(text: str) -> set[str]:
    """Topic words from text (drops filler/visual words). Used to require that a
    candidate image is actually ABOUT the subject, not just any 'diagram'."""
    terms: set[str] = set()
    for w in re.findall(r"[a-z]+", (text or "").lower()):
        if len(w) > 2 and w not in _IMG_GENERIC:
            terms.add(w)
            terms.update(_SYNONYMS.get(w, []))
    return terms


def _effective_subject(question: str, history: list | None) -> str:
    """The real subject to search for. For a contextless follow-up like
    'I want the diagram' or 'how does it look', recover the subject from the most
    recent prior USER question that actually had one."""
    subject = _clean_subject(question)
    if _meaningful_terms(subject):
        return subject
    for turn in reversed(history or []):
        role = turn.get("role") if isinstance(turn, dict) else getattr(turn, "role", None)
        content = turn.get("content") if isinstance(turn, dict) else getattr(turn, "content", "")
        if role == "user" and content:
            prev = _clean_subject(content)
            if _meaningful_terms(prev):
                return prev
    return subject

# Strip conversational filler so the web query is the actual subject, e.g.
# "Give me a picture of Ebola" → "Ebola"; "What does the HIV virus look like" →
# "HIV virus". A clean subject returns far better, more servable images.
# Every token requires a trailing space so it only strips WHOLE leading words —
# never bites into a real word (e.g. it must not turn "Anatomy" into "natomy").
_FILLER_LEAD = re.compile(
    r"^\s*(?:please\s+)?(?:(?:can|could|would)\s+)?(?:you\s+)?(?:please\s+)?"
    r"(?:(?:give|show|get|find|tell|let)\s+)?(?:me\s+)?"
    r"(?:i\s+(?:want|need)\s+)?(?:to\s+see\s+)?(?:see\s+)?"
    r"(?:(?:a|an|the)\s+)?"
    r"(?:(?:picture|image|diagram|photo|illustration|drawing|figure|pic)\s+)?"
    r"(?:(?:of|for|showing)\s+)?",
    re.IGNORECASE,
)


def _clean_subject(question: str) -> str:
    q = question.strip().rstrip("?.!")
    q = re.sub(r"\bwhat (?:does|do|is|are)\b", " ", q, flags=re.IGNORECASE)
    q = re.sub(r"\bhow (?:does|do)\b", " ", q, flags=re.IGNORECASE)
    q = re.sub(r"\blooks?\s+like\b", " ", q, flags=re.IGNORECASE)
    q = _FILLER_LEAD.sub("", q)
    q = re.sub(r"\b(?:a|an|the)\b", " ", q, flags=re.IGNORECASE)
    q = re.sub(r"\s+", " ", q).strip()
    return q or question.strip()

# Hosts we trust more for medical images (educational / clinical / reference).
_TRUSTED_DOMAIN_BITS = (
    "wikimedia", "wikipedia", "pubchem", "ncbi", "nih.gov", "who.int", "cdc.gov",
    "statpearls", "kenhub", "teachmeanatomy", "radiopaedia", "osmosis", "amboss",
    "lecturio", "geekymedics", "medlineplus", "mayoclinic", "clevelandclinic",
    "openstax", "getbodysmart", "innerbody", "netterimages", "britannica",
    "microbenotes", "biologydictionary", "healthline", "verywellhealth", "webmd",
    "physio-pedia", "anatomy", "medical", "derm", "medscape",
)


def _domain(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""


def _domain_trust(domain: str) -> int:
    """0–3 trust score for an image host (higher = more reliable medical source)."""
    if not domain:
        return 0
    if domain.endswith((".edu", ".gov", ".ac.uk")):
        return 3
    if any(bit in domain for bit in _TRUSTED_DOMAIN_BITS):
        return 2
    return 1


def _rank_score(cand: dict, terms: set[str]) -> int:
    """Rank a candidate: relevance to the question + source trust + a small
    bonus for things that read like a labelled diagram."""
    text = f"{cand.get('url','')} {cand.get('title','')} {cand.get('_desc','')}"
    relevant = 4 if _has_term(text, terms) else 0
    trust = _domain_trust(cand.get("_domain", "")) * 2
    labelled = 1 if re.search(r"diagram|labell?ed|anatomy|cross[- ]?section", text, re.I) else 0
    return relevant + trust + labelled


async def _tavily_images(client, query: str) -> tuple[list, list]:
    """One Tavily image search → (images, results). Never raises."""
    try:
        resp = await asyncio.wait_for(
            client.search(query=query, search_depth="basic",
                          include_images=True, include_image_descriptions=True,
                          max_results=8),
            timeout=6.0,
        )
        return resp.get("images") or [], resp.get("results") or []
    except Exception as exc:
        logger.warning("web image search failed for %r: %s", query, exc)
        return [], []


async def _web_candidates(subject: str, appearance: bool) -> list[dict]:
    """Image candidates from the open web (ANY site) via Tavily. Runs two query
    variants on the subject and merges them, so there are enough good, servable
    candidates after blocked/stock hosts are dropped. Unverified — the
    orchestrator verifies + relevance-filters the top-ranked ones."""
    from app.core.rag.web_search import _get_tavily_client

    # Pick query modality by intent: clinical-appearance topics (melanoma, a
    # rash, "what does X look like") need real PHOTOS — forcing "diagram" returns
    # almost nothing. Anatomy/structure topics want labelled diagrams. In both
    # cases the bare subject is included as a high-yield second variant.
    if appearance:
        queries = [f"{subject} clinical photo", subject]
    else:
        queries = [f"{subject} diagram", subject]
    client = _get_tavily_client()
    pairs = await asyncio.gather(*[_tavily_images(client, q) for q in queries])

    pages: dict[str, str] = {}
    for _, results in pairs:
        for r in results:
            d = _domain(r.get("url", ""))
            if d and d not in pages:
                pages[d] = r.get("url")

    out: list[dict] = []
    seen_urls: set[str] = set()
    for images, _ in pairs:
        for item in images:
            url = item.get("url") if isinstance(item, dict) else item
            desc = item.get("description", "") if isinstance(item, dict) else ""
            if not url or url in seen_urls or _BAD_IMG_URL.search(url):
                continue
            dom = _domain(url)
            # Skip stock/watermarked/hotlink-blocked hosts (render broken in-app).
            if any(b in dom for b in _BLOCKED_IMG_DOMAINS):
                continue
            seen_urls.add(url)
            out.append({
                "url": url,
                "title": _clean(desc) or "Medical illustration",
                "source": dom or "Web",
                "page_url": pages.get(dom) or url,
                "_domain": dom,
                "_desc": desc,
            })
    return out


async def _curated_candidate(question: str, role: str) -> dict | None:
    """The best curated/learned image (often Wikimedia/PubChem or an owned asset)
    as ONE ranked candidate — no longer auto-preferred over the web."""
    query = detect_visual_query(question, role)
    if not query:
        return None
    img = await resolve_concept(query)
    if not img:
        return None
    dom = _domain(img.get("url", "")) or (img.get("source", "") or "").lower()
    return {**img, "_domain": dom, "_desc": img.get("title", "")}


def _public(cand: dict) -> dict:
    """Drop internal scoring keys before returning to the caller."""
    return {k: v for k, v in cand.items() if not k.startswith("_")}


async def find_medical_images(
    question: str, role: str, history: list | None = None, limit: int = 3
) -> list[dict]:
    """Source-agnostic, ranked image retrieval. Returns up to `limit` real images
    for a visual question — gathered from the open web AND the curated/learned
    set, HARD-filtered so every reference is actually about the subject (no random
    'diagram' images), ranked by relevance + source trust, de-duplicated by site.
    Recovers the subject from history for contextless follow-ups ('I want the
    diagram'). Winners are persisted to the learning KB. Returns [] for non-visual
    or when the subject can't be determined (better no image than a wrong one)."""
    from app.utils.background import fire_and_forget

    # Universal (study/textbook feel): attempt an illustration for ANY substantive
    # question that has a real subject — the user shouldn't have to ask for a
    # diagram. The hard relevance filter + load verification below ensure an image
    # only shows when it's genuinely about the topic, so non-visual questions
    # (e.g. a plain dosage) simply get no image rather than a wrong one.
    # Conversational greetings never reach here (gated by tier upstream).
    subject = _effective_subject(question, history)
    meaningful = _meaningful_terms(subject)
    if not meaningful:
        # Couldn't tell what the user wants a picture OF — don't guess.
        return []
    appearance = bool(_APPEARANCE_INTENT.search(question))

    cache_key = f"imgs:{_CACHE_VERSION}:{query_hash(subject)}:{int(appearance)}:{limit}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached or []

    # Gather from all sources in parallel — Wikimedia is just one candidate now.
    curated, web = await asyncio.gather(
        _curated_candidate(question, role),
        _web_candidates(subject, appearance),
    )

    # HARD relevance filter on web candidates: the image must actually be ABOUT
    # the subject (drops generic Sankey/sequence/product-launch diagrams that
    # merely matched the word "diagram"). The curated candidate is concept-matched
    # already, so it's trusted without this check.
    pool: list[dict] = [
        c for c in web
        if _has_term(f"{c.get('url','')} {c.get('title','')} {c.get('_desc','')}", meaningful)
    ]
    if curated:
        pool.append(curated)

    pool.sort(key=lambda c: _rank_score(c, meaningful), reverse=True)

    # Verify the top candidates load (concurrently, so it stays fast), then take
    # the best that work — ONE per domain so references come from different sites.
    top = pool[:10]
    loads = await asyncio.gather(*[_image_loads(c["url"]) for c in top], return_exceptions=True)
    chosen: list[dict] = []
    seen_domains: set[str] = set()
    for cand, ok in zip(top, loads):
        if ok is not True:
            continue
        dom = cand.get("_domain") or cand.get("source", "")
        if dom in seen_domains:
            continue
        seen_domains.add(dom)
        chosen.append(_public(cand))
        if len(chosen) >= limit:
            break

    if chosen:
        await cache_set(cache_key, chosen, _TTL_HIT)
        # LEARN the best one so it's permanent + instant next time.
        fire_and_forget(_db_put(f"webq:{subject}", chosen[0]))
        fire_and_forget(_log_resolution(subject, True))
        logger.info("IMAGES subj=%.40s -> %d refs (%s)", subject, len(chosen),
                    ", ".join(c["source"] for c in chosen))
    else:
        await cache_set(cache_key, [], _TTL_IMGS_MISS)  # short — retry soon
        fire_and_forget(_log_coverage_gap(question))
        fire_and_forget(_log_resolution(subject, False))
    return chosen


async def _log_coverage_gap(question: str) -> None:
    try:
        norm = re.sub(r"\s+", " ", question.strip().lower())[:200]
        db = await get_db()
        await db.rpc("bump_coverage_gap", {"p_norm": norm, "p_sample": question[:300]}).execute()
    except Exception:
        pass


async def find_medical_image(question: str, role: str, history: list | None = None) -> dict | None:
    """Single best image — back-compat for the non-streaming pipeline."""
    imgs = await find_medical_images(question, role, history=history, limit=1)
    return imgs[0] if imgs else None


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
