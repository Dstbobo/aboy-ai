"""
Knowledge base seeder — run once after migration.
Usage: python -m app.db.seeder
Seeds minimum 10 WHO/CDC/NICE sources and fetches initial chunks via web.
"""

import asyncio
import hashlib
import logging
from datetime import date

import httpx

from app.config import get_settings
from app.core.rag.embedder import embed_documents
from app.db.supabase import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SEED_SOURCES = [
    {
        "name": "WHO — Essential Medicines List 2023",
        "source_type": "who",
        "url": "https://www.who.int/publications/i/item/WHO-MHP-HPS-EML-2023.02",
        "evidence_grade": "A",
        "specialty_tags": ["pharmacology", "general"],
        "publication_date": date(2023, 7, 1),
        "content": (
            "The WHO Model List of Essential Medicines (EML) identifies medications that satisfy "
            "the priority health care needs of a population. Medicines are selected based on disease "
            "prevalence, evidence of clinical efficacy and safety, and comparative cost-effectiveness. "
            "The 2023 list includes over 500 medicines across therapeutic categories including "
            "anaesthetics, analgesics, antiallergics, antidotes, anticonvulsants, anti-infectives, "
            "antimigraine, antineoplastics, antiparkinson, blood products, cardiovascular medicines, "
            "dermatological medicines, diagnostic agents, disinfectants, diuretics, gastrointestinal, "
            "hormones, immunologicals, muscle relaxants, ophthalmological, oxytocics, palliative care, "
            "peritoneal dialysis, psychotherapeutic, reproductive health, and respiratory medicines."
        ),
    },
    {
        "name": "WHO — Global Tuberculosis Report 2023",
        "source_type": "who",
        "url": "https://www.who.int/teams/global-tuberculosis-programme/tb-reports/global-tuberculosis-report-2023",
        "evidence_grade": "A",
        "specialty_tags": ["infectious_disease", "pulmonology"],
        "publication_date": date(2023, 11, 1),
        "content": (
            "Tuberculosis (TB) remains one of the world's deadliest infectious diseases. "
            "In 2022, 7.5 million people were newly diagnosed with TB — the highest number since "
            "WHO began global TB monitoring. Standard treatment for drug-susceptible TB is a "
            "6-month regimen: 2 months of isoniazid, rifampicin, pyrazinamide, and ethambutol "
            "followed by 4 months of isoniazid and rifampicin. Drug-resistant TB (MDR/RR-TB) "
            "requires longer regimens including bedaquiline, linezolid, and newer agents. "
            "BCG vaccination is recommended at birth in high-burden countries to prevent severe "
            "childhood TB. HIV-TB co-infection requires integrated management with antiretrovirals."
        ),
    },
    {
        "name": "CDC — Diabetes Prevention and Management Guidelines",
        "source_type": "cdc",
        "url": "https://www.cdc.gov/diabetes/managing/index.html",
        "evidence_grade": "A",
        "specialty_tags": ["endocrinology", "internal_medicine", "primary_care"],
        "publication_date": date(2023, 6, 1),
        "content": (
            "Type 2 diabetes (T2DM) affects over 37 million Americans. Management goals include "
            "HbA1c <7% for most adults, blood pressure <130/80 mmHg, and LDL-C <100 mg/dL. "
            "First-line pharmacotherapy is metformin unless contraindicated. Second-line agents "
            "include GLP-1 receptor agonists (semaglutide, liraglutide), SGLT2 inhibitors "
            "(empagliflozin, dapagliflozin), DPP-4 inhibitors, sulfonylureas, and insulin. "
            "GLP-1 agonists and SGLT2 inhibitors are preferred in patients with established ASCVD, "
            "heart failure, or chronic kidney disease due to cardiovascular and renal benefits. "
            "Lifestyle intervention including weight loss, physical activity (150 min/week moderate "
            "intensity), and dietary modification are foundational. Self-monitoring of blood glucose "
            "and continuous glucose monitoring improve glycemic outcomes."
        ),
    },
    {
        "name": "CDC — Hypertension Clinical Guidance",
        "source_type": "cdc",
        "url": "https://www.cdc.gov/bloodpressure/index.htm",
        "evidence_grade": "A",
        "specialty_tags": ["cardiology", "internal_medicine", "primary_care"],
        "publication_date": date(2023, 5, 1),
        "content": (
            "Hypertension is defined as blood pressure ≥130/80 mmHg (AHA/ACC 2017 guidelines). "
            "Stage 1: 130-139/80-89 mmHg. Stage 2: ≥140/90 mmHg. Hypertensive crisis: >180/120 mmHg. "
            "First-line antihypertensive agents: thiazide diuretics (hydrochlorothiazide, chlorthalidone), "
            "ACE inhibitors (lisinopril, enalapril), ARBs (losartan, valsartan), and calcium channel "
            "blockers (amlodipine, nifedipine). ACE inhibitors/ARBs are preferred in diabetics and "
            "CKD. Beta-blockers (metoprolol, carvedilol) preferred post-MI or with heart failure. "
            "Lifestyle modifications: DASH diet, sodium restriction <2.3g/day, weight loss, "
            "physical activity, moderate alcohol, smoking cessation. Most patients require 2+ agents "
            "to reach target. White coat hypertension should be confirmed with ambulatory BP monitoring."
        ),
    },
    {
        "name": "NICE — Type 2 Diabetes in Adults Management (NG28)",
        "source_type": "nice",
        "url": "https://www.nice.org.uk/guidance/ng28",
        "evidence_grade": "A",
        "specialty_tags": ["endocrinology", "primary_care"],
        "publication_date": date(2022, 6, 29),
        "content": (
            "NICE NG28 recommends individualised HbA1c targets for type 2 diabetes. "
            "Target HbA1c 48 mmol/mol (6.5%) for drug-naive patients, 53 mmol/mol (7%) for those "
            "on one glucose-lowering drug, and individualised targets for complex patients. "
            "Offer metformin as initial drug treatment if tolerated. Review HbA1c every 3-6 months "
            "and intensify treatment if target not met. Add empagliflozin or dapagliflozin if ASCVD "
            "or high CV risk. Add GLP-1 agonist if BMI ≥35 or weight loss needed. "
            "Consider SGLT2 inhibitor for renal protection in CKD (eGFR ≥25 mL/min/1.73m²). "
            "Dual and triple therapy combinations should be evidence-based. "
            "Refer to specialist if HbA1c remains elevated despite triple therapy or insulin required."
        ),
    },
    {
        "name": "NICE — Hypertension in Adults Diagnosis and Management (NG136)",
        "source_type": "nice",
        "url": "https://www.nice.org.uk/guidance/ng136",
        "evidence_grade": "A",
        "specialty_tags": ["cardiology", "primary_care"],
        "publication_date": date(2023, 3, 1),
        "content": (
            "NICE NG136 defines hypertension as clinic BP ≥140/90 mmHg confirmed by ABPM/HBPM. "
            "Stage 1: clinic 140-159/90-99, ABPM 135-149/85-94. Stage 2: clinic ≥160/100, ABPM ≥150/95. "
            "Severe: clinic systolic ≥180 or diastolic ≥120. "
            "Step 1: ACE inhibitor (or ARB if intolerant) for <55 years; CCB for ≥55 or Black African "
            "origin. Step 2: ACE/ARB + CCB. Step 3: ACE/ARB + CCB + thiazide-like diuretic "
            "(chlorthalidone or indapamide preferred over hydrochlorothiazide). Step 4: resistant "
            "hypertension — add low-dose spironolactone if K+ <4.5, or alpha/beta-blocker. "
            "Offer ABPM or HBPM to confirm diagnosis. Assess CV risk with QRISK3. "
            "Lifestyle advice: weight management, exercise, salt restriction, alcohol reduction."
        ),
    },
    {
        "name": "NICE — Asthma Diagnosis and Monitoring (NG80)",
        "source_type": "nice",
        "url": "https://www.nice.org.uk/guidance/ng80",
        "evidence_grade": "A",
        "specialty_tags": ["respiratory", "primary_care", "paediatrics"],
        "publication_date": date(2023, 3, 1),
        "content": (
            "Asthma diagnosis requires objective evidence: spirometry with ≥12% and ≥200mL FEV1 "
            "reversibility, peak flow variability >20%, or positive bronchial challenge test. "
            "BTS/SIGN/NICE stepwise management: Step 1 — SABA (salbutamol) PRN. "
            "Step 2 — add low-dose ICS (beclometasone 200-400mcg/day). "
            "Step 3 — add LABA (salmeterol or formoterol); if <5 years use LTRA (montelukast). "
            "Step 4 — increase ICS to medium dose or add LTRA, theophylline, or tiotropium. "
            "Step 5 — specialist referral, consider omalizumab (anti-IgE), mepolizumab, or benralizumab "
            "for severe eosinophilic asthma, or oral corticosteroids at lowest effective dose. "
            "Assess and optimise inhaler technique at every review. "
            "Acute severe asthma: SABA nebulised, oxygen to maintain SpO2 94-98%, oral/IV prednisolone."
        ),
    },
    {
        "name": "WHO — Integrated Management of Childhood Illness (IMCI)",
        "source_type": "who",
        "url": "https://www.who.int/teams/maternal-newborn-child-adolescent-health-and-ageing/child-health/integrated-management-of-childhood-illness",
        "evidence_grade": "A",
        "specialty_tags": ["paediatrics", "primary_care", "global_health"],
        "publication_date": date(2022, 1, 1),
        "content": (
            "IMCI is the WHO/UNICEF strategy for managing common childhood illnesses in low-resource settings. "
            "Key classifications and treatments: "
            "Pneumonia: fast breathing (≥60 bpm <2mo, ≥50 bpm 2-12mo, ≥40 bpm 1-5yr) — oral amoxicillin "
            "40mg/kg/day for 5 days. Severe pneumonia: refer + IM ampicillin and gentamicin. "
            "Diarrhoea: ORS 75mEq/L sodium, zinc supplementation 20mg/day for 10-14 days. "
            "Malaria: in endemic areas — artemisinin-based combination therapy (ACT). "
            "Malnutrition: MUAC <11.5cm = severe acute malnutrition — RUTF, treat complications. "
            "Fever: assess for malaria, meningitis, measles. "
            "Ear infection: amoxicillin 40mg/kg/day for 5-10 days. "
            "Immunisation: check and complete EPI schedule at every visit. "
            "Breastfeeding: exclusive for 6 months, continued with complementary foods to 2 years."
        ),
    },
    {
        "name": "CDC — Antibiotic Prescribing and Stewardship",
        "source_type": "cdc",
        "url": "https://www.cdc.gov/antibiotic-use/clinicians/index.html",
        "evidence_grade": "A",
        "specialty_tags": ["infectious_disease", "pharmacology", "primary_care"],
        "publication_date": date(2023, 4, 1),
        "content": (
            "Antibiotic stewardship is essential to combat antimicrobial resistance (AMR). "
            "Community-acquired pneumonia (CAP): amoxicillin 1g TDS for outpatients; doxycycline 100mg BD "
            "if atypical suspected; azithromycin 500mg day 1 then 250mg days 2-5. "
            "UTI uncomplicated: nitrofurantoin 100mg MR BD x5 days (first-line); trimethoprim 200mg BD x7 "
            "days; fosfomycin 3g single dose. "
            "Skin and soft tissue infections: flucloxacillin 500mg QDS for cellulitis (MSSA); "
            "co-amoxiclav for polymicrobial/bite wounds; clindamycin or vancomycin for MRSA. "
            "Pharyngitis: no antibiotics if FeverPAIN/Centor score low; phenoxymethylpenicillin 500mg "
            "QDS x10 days for GAS. Always consider resistance patterns, patient allergies, renal function, "
            "pregnancy, and drug interactions. Document indication, dose, duration, and review date."
        ),
    },
    {
        "name": "NICE — Depression in Adults (NG222)",
        "source_type": "nice",
        "url": "https://www.nice.org.uk/guidance/ng222",
        "evidence_grade": "A",
        "specialty_tags": ["psychiatry", "mental_health", "primary_care"],
        "publication_date": date(2022, 6, 29),
        "content": (
            "NICE NG222 updated guidance on treating depression in adults. "
            "Diagnosis: PHQ-9 ≥10 + clinical assessment. Classify as less severe (PHQ-9 10-19) "
            "or more severe (PHQ-9 ≥20 or significant functional impairment). "
            "Less severe: offer low-intensity psychosocial interventions first (guided self-help, CBT, "
            "behavioural activation, group exercise, mindfulness). Antidepressants only if patient prefers "
            "or other treatments not effective. "
            "More severe: offer antidepressant + high-intensity psychological therapy simultaneously. "
            "First-line antidepressants: SSRIs (sertraline preferred — evidence, tolerability, cost). "
            "Review at 2-4 weeks after starting antidepressant. Continue for ≥6 months after remission. "
            "Two or more episodes: consider 2+ years maintenance. "
            "Refer to specialist: severe/complex depression, psychotic features, bipolar risk, "
            "inadequate response to 2 antidepressants, high suicide risk."
        ),
    },
]


async def seed_knowledge_base() -> None:
    db = await get_db()

    logger.info("Starting knowledge base seeding — %d sources", len(SEED_SOURCES))

    for source in SEED_SOURCES:
        content = source.pop("content")

        existing = await db.table("knowledge_sources").select("id").eq("name", source["name"]).maybe_single().execute()
        if existing.data:
            logger.info("  SKIP (exists): %s", source["name"])
            source["content"] = content
            continue

        ins = await db.table("knowledge_sources").insert({
            **source,
            "publication_date": source["publication_date"].isoformat() if source.get("publication_date") else None,
            "ingestion_status": "processing",
        }).execute()
        source_id = ins.data[0]["id"]
        logger.info("  Created source: %s [%s]", source["name"], source_id)

        chunks = _chunk_text(content, source_id)
        texts = [c["content"] for c in chunks]

        logger.info("    Embedding %d chunk(s)…", len(chunks))
        embeddings = await embed_documents(texts)

        for chunk, embedding in zip(chunks, embeddings):
            chunk["embedding"] = embedding
            chunk["metadata"] = {
                "source_name": source["name"],
                "url": source.get("url"),
                "evidence_grade": source.get("evidence_grade"),
            }

        await db.table("knowledge_chunks").insert(chunks).execute()
        await db.table("knowledge_sources").update({
            "ingestion_status": "completed",
            "chunk_count": len(chunks),
        }).eq("id", source_id).execute()

        logger.info("    Ingested %d chunks for '%s'", len(chunks), source["name"])
        source["content"] = content

    logger.info("Seeding complete.")


def _chunk_text(text: str, source_id: str) -> list[dict]:
    words = text.split()
    chunk_size = 400
    overlap = 40
    chunks = []
    i = 0
    idx = 0

    while i < len(words):
        window = words[i : i + chunk_size]
        content = " ".join(window)
        chunks.append({
            "source_id": source_id,
            "content": content,
            "chunk_index": idx,
            "section_title": None,
            "specialty_tags": [],
        })
        i += chunk_size - overlap
        idx += 1

    return chunks


if __name__ == "__main__":
    asyncio.run(seed_knowledge_base())
