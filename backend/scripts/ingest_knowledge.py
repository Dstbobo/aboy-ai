"""Ingest a curated, source-attributed medical corpus into the knowledge base.

Each entry is an accurate, concise clinical summary attributed to an
authoritative body (WHO / CDC / NICE / PubMed / StatPearls). Content is
embedded with Voyage (document) and inserted as a knowledge_source + chunk,
matching the existing schema so citations work. Idempotent via content_hash.

Usage:  python -m scripts.ingest_knowledge
"""
import asyncio
import hashlib
import socket
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.core.rag.embedder import embed_documents  # noqa: E402

DB = dict(
    host=socket.getaddrinfo("aws-1-eu-central-1.pooler.supabase.com", 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0],
    port=6543, user="postgres.szsdvkziqskrfveuemsi", password="452345Dst@ff",
    database="postgres", ssl="require", statement_cache_size=0,
)

# (name, source_type, url, evidence_grade, specialty_tags, section_title, content)
CORPUS: list[tuple] = [
    ("NICE - Hypertension in Adults (NG136)", "nice", "https://www.nice.org.uk/guidance/ng136", "A",
     ["cardiology", "general"], "Hypertension management",
     "NICE NG136 defines stage 1 hypertension as clinic BP 140/90-159/99 mmHg with ambulatory/home average >=135/85, and stage 2 as clinic BP >=160/100. Offer antihypertensive drug treatment to anyone with stage 2 hypertension, and to those under 80 with stage 1 plus target-organ damage, established cardiovascular disease, renal disease, diabetes, or a 10-year CVD risk >=10%. First-line treatment for people under 55 (without type 2 diabetes of African/Caribbean origin) is an ACE inhibitor or ARB; for those over 55 or of African/Caribbean origin, a calcium-channel blocker. Target clinic BP is below 140/90 (below 150/90 if aged 80+). Lifestyle advice - reduced salt, weight loss, exercise, limiting alcohol - is recommended for all."),

    ("NICE - Type 2 Diabetes in Adults (NG28)", "nice", "https://www.nice.org.uk/guidance/ng28", "A",
     ["endocrinology", "internal_medicine"], "Type 2 diabetes management",
     "NICE NG28 recommends metformin as first-line drug treatment for type 2 diabetes, titrated slowly to limit GI side effects; use modified-release metformin if not tolerated. An individualised HbA1c target (commonly 48-53 mmol/mol) is set. SGLT2 inhibitors with proven cardiovascular benefit are recommended in addition to metformin for people with established atherosclerotic cardiovascular disease, heart failure, or high CVD risk. If dual therapy fails to control HbA1c, intensify to triple therapy or insulin-based regimens. Structured education, annual review of complications (retinopathy, nephropathy, neuropathy, foot risk), blood pressure and lipid management are core components."),

    ("GINA / NICE - Asthma Management (NG80)", "nice", "https://www.nice.org.uk/guidance/ng80", "A",
     ["respiratory", "general"], "Asthma management",
     "Asthma is a chronic inflammatory airway disorder causing variable, reversible airflow obstruction with wheeze, cough, chest tightness and breathlessness. Diagnosis is supported by spirometry showing obstruction with bronchodilator reversibility, raised FeNO, or peak-flow variability. Management follows a stepwise approach: all patients should receive an inhaled corticosteroid (ICS); modern GINA guidance recommends ICS-formoterol as both maintenance and reliever therapy rather than short-acting beta-agonist (SABA) alone, because SABA-only treatment increases exacerbation risk. Step up with long-acting beta-agonists (LABA) and higher ICS doses as needed. Inhaler technique, adherence and trigger avoidance are reviewed at every step."),

    ("GOLD / NICE - COPD (NG115)", "nice", "https://www.nice.org.uk/guidance/ng115", "A",
     ["respiratory"], "COPD management",
     "Chronic obstructive pulmonary disease (COPD) is characterised by persistent airflow limitation that is not fully reversible, confirmed by post-bronchodilator FEV1/FVC < 0.70. Smoking cessation is the single most important intervention and the only one shown to slow disease progression. Initial inhaled therapy is a long-acting bronchodilator (LABA or LAMA); inhaled corticosteroids are added for frequent exacerbations or asthmatic features/eosinophilia. Pulmonary rehabilitation, influenza and pneumococcal vaccination, and prompt treatment of exacerbations are recommended. Long-term oxygen therapy is considered for chronic hypoxaemia (PaO2 <= 7.3 kPa)."),

    ("NICE - Chronic Heart Failure (NG106)", "nice", "https://www.nice.org.uk/guidance/ng106", "A",
     ["cardiology"], "Heart failure with reduced ejection fraction",
     "Heart failure with reduced ejection fraction (HFrEF, LVEF < 40%) is managed with disease-modifying therapy that improves survival: an ACE inhibitor (or ARB) plus a beta-blocker licensed for heart failure, with a mineralocorticoid receptor antagonist added if symptoms persist. SGLT2 inhibitors (dapagliflozin, empagliflozin) and, where appropriate, sacubitril-valsartan further reduce mortality and hospitalisation. Loop diuretics relieve congestion but do not improve prognosis. Diagnosis is supported by raised natriuretic peptides (BNP/NT-proBNP) and confirmed by echocardiography. Patients should be reviewed regularly with monitoring of renal function and electrolytes."),

    ("StatPearls - Acute Coronary Syndrome", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK459157/", "A",
     ["cardiology", "emergency"], "Acute coronary syndrome",
     "Acute coronary syndrome (ACS) spans unstable angina, NSTEMI and STEMI, usually caused by atherosclerotic plaque rupture and coronary thrombosis. Presentation is typically central crushing chest pain that may radiate to the arm or jaw, with sweating, nausea and dyspnoea; presentations can be atypical in women, older adults and people with diabetes. Initial management (MONA-plus) includes aspirin 300 mg, a second antiplatelet, anticoagulation, oxygen if hypoxic, nitrates and analgesia. STEMI requires immediate reperfusion by primary percutaneous coronary intervention (preferred) or thrombolysis if PCI is unavailable within 120 minutes. Troponin and serial ECGs guide diagnosis and risk stratification."),

    ("StatPearls - Sepsis (Surviving Sepsis)", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK547669/", "A",
     ["emergency", "infectious_disease", "critical_care"], "Sepsis recognition and management",
     "Sepsis is life-threatening organ dysfunction caused by a dysregulated host response to infection. It is identified clinically by an increase in SOFA score, with qSOFA (RR >= 22, altered mentation, SBP <= 100) as a bedside prompt. The Surviving Sepsis 'Hour-1 bundle' includes measuring lactate, obtaining blood cultures before antibiotics, giving broad-spectrum antibiotics, starting 30 mL/kg crystalloid for hypotension or lactate >= 4 mmol/L, and using vasopressors (noradrenaline first-line) to maintain mean arterial pressure >= 65 mmHg. Early recognition and antibiotics within the first hour reduce mortality."),

    ("StatPearls - Community-Acquired Pneumonia", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK430749/", "A",
     ["respiratory", "infectious_disease"], "Community-acquired pneumonia",
     "Community-acquired pneumonia (CAP) presents with cough, fever, pleuritic chest pain, dyspnoea and focal chest signs, confirmed by infiltrate on chest radiograph. Streptococcus pneumoniae is the most common pathogen. Severity is assessed with CURB-65 (confusion, urea > 7, RR >= 30, BP < 90/60, age >= 65) to guide site of care. Low-severity CAP is treated with amoxicillin (or a macrolide/doxycycline if penicillin-allergic); moderate-to-severe disease needs combination therapy with a beta-lactam plus a macrolide. Reassess at 48-72 hours and de-escalate based on response and cultures."),

    ("StatPearls - Urinary Tract Infection", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK470195/", "B",
     ["urology", "infectious_disease", "general"], "Urinary tract infection",
     "Urinary tract infections (UTIs) most commonly result from Escherichia coli. Uncomplicated cystitis causes dysuria, frequency, urgency and suprapubic discomfort without fever. First-line treatment for uncomplicated cystitis is nitrofurantoin or trimethoprim (per local resistance), with short courses (3-5 days) in non-pregnant women. Pyelonephritis adds fever, flank pain and systemic upset and requires longer courses of broader agents such as a fluoroquinolone or a cephalosporin. Pregnant women, men, and people with catheters or structural abnormalities are treated as complicated UTIs. Asymptomatic bacteriuria is treated only in pregnancy or before urological procedures."),

    ("StatPearls - Acute Kidney Injury", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK441896/", "A",
     ["nephrology", "critical_care"], "Acute kidney injury",
     "Acute kidney injury (AKI) is a rapid decline in renal function defined by KDIGO as a rise in serum creatinine of >= 26.5 micromol/L within 48 hours, a 1.5x rise within 7 days, or urine output < 0.5 mL/kg/h for 6 hours. Causes are categorised as pre-renal (hypovolaemia, hypotension), intrinsic renal (acute tubular necrosis, glomerulonephritis, nephrotoxins) and post-renal (obstruction). Management focuses on treating the cause, optimising fluid status and perfusion, stopping nephrotoxic drugs, and monitoring for complications such as hyperkalaemia, acidosis and fluid overload. Renal replacement therapy is indicated for refractory hyperkalaemia, acidosis, fluid overload or uraemic complications."),

    ("WHO - Iron Deficiency Anaemia", "who", "https://www.who.int/health-topics/anaemia", "A",
     ["haematology", "general"], "Iron deficiency anaemia",
     "Anaemia is defined by WHO as haemoglobin below 130 g/L in men, 120 g/L in non-pregnant women and 110 g/L in pregnancy. Iron deficiency is the most common cause worldwide, arising from inadequate intake, malabsorption, or chronic blood loss (menstrual or gastrointestinal). It produces a microcytic, hypochromic anaemia with low ferritin and low transferrin saturation. Management is to identify and treat the underlying cause and replace iron, usually with oral ferrous salts; intravenous iron is used when oral therapy is not tolerated or absorbed. In men and postmenopausal women, iron deficiency anaemia warrants investigation for gastrointestinal blood loss."),

    ("NICE - Depression in Adults (NG222)", "nice", "https://www.nice.org.uk/guidance/ng222", "A",
     ["mental_health", "general"], "Depression management",
     "NICE NG222 recommends matching treatment to depression severity and patient preference. For less severe depression, offer psychological interventions (guided self-help, cognitive behavioural therapy, behavioural activation) before antidepressants. For more severe depression, offer a combination of an antidepressant and psychological therapy. SSRIs are first-line pharmacotherapy because of their favourable safety profile; review within 1-2 weeks, continue for at least 6 months after remission, and withdraw gradually to limit discontinuation symptoms. Assess suicide risk at every contact and arrange urgent help where risk is significant."),

    ("WHO - Malaria Treatment Guidelines", "who", "https://www.who.int/teams/global-malaria-programme", "A",
     ["infectious_disease", "tropical_medicine"], "Malaria diagnosis and treatment",
     "Malaria is caused by Plasmodium parasites transmitted by Anopheles mosquitoes; P. falciparum causes the most severe disease. Diagnosis should be confirmed by microscopy or a rapid diagnostic test before treatment. WHO recommends artemisinin-based combination therapy (ACT) as first-line treatment for uncomplicated P. falciparum malaria. Severe malaria (impaired consciousness, respiratory distress, severe anaemia, hypoglycaemia, renal impairment, or high parasitaemia) is a medical emergency treated with intravenous artesunate, followed by a full ACT course. Prevention combines insecticide-treated nets, indoor residual spraying, chemoprophylaxis for travellers, and prompt treatment."),

    ("WHO - HIV Treatment", "who", "https://www.who.int/teams/global-hiv-hepatitis-and-stis-programmes", "A",
     ["infectious_disease"], "HIV antiretroviral therapy",
     "WHO recommends antiretroviral therapy (ART) for all people living with HIV regardless of CD4 count, started as soon as possible after diagnosis ('treat all'). Preferred first-line regimens are based on dolutegravir combined with a nucleoside backbone (e.g. tenofovir + lamivudine). The treatment goal is sustained viral suppression, which preserves immune function and prevents transmission (undetectable = untransmittable). Adherence support, routine viral-load monitoring, screening and prevention of opportunistic infections (including TB), and pre-exposure prophylaxis (PrEP) for those at substantial risk are key components of HIV care."),

    ("WHO / CDC - Antimicrobial Resistance and Stewardship", "who", "https://www.who.int/health-topics/antimicrobial-resistance", "A",
     ["infectious_disease", "pharmacology"], "Antimicrobial stewardship",
     "Antimicrobial resistance (AMR) occurs when microorganisms evolve to survive drugs that previously killed them, driven largely by overuse and misuse of antimicrobials. Stewardship aims to optimise outcomes while minimising resistance: prescribe antibiotics only when indicated, choose the narrowest effective agent guided by local resistance and cultures, use correct dose and duration, review at 48-72 hours, and de-escalate or stop promptly. Infection prevention, vaccination, and avoiding antibiotics for viral infections all reduce resistance. AMR is one of the top global public-health threats."),

    ("StatPearls - Anticoagulation (Warfarin and DOACs)", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK482175/", "A",
     ["cardiology", "haematology", "pharmacology"], "Anticoagulation",
     "Anticoagulants prevent and treat thromboembolism in conditions such as atrial fibrillation, venous thromboembolism and mechanical heart valves. Warfarin, a vitamin K antagonist, requires regular INR monitoring (target usually 2-3) and has many food and drug interactions; its effect is reversed with vitamin K or prothrombin complex concentrate. Direct oral anticoagulants (DOACs: apixaban, rivaroxaban, dabigatran, edoxaban) have predictable pharmacokinetics, need no routine monitoring, and are first-line for non-valvular atrial fibrillation and VTE; doses are adjusted for renal function. Bleeding risk must be weighed against thrombotic risk using tools such as CHA2DS2-VASc and HAS-BLED."),

    ("WHO - Cancer Pain / Analgesic Ladder", "who", "https://www.who.int/publications/i/item/9789241550390", "A",
     ["palliative_care", "pharmacology"], "Pain management ladder",
     "The WHO analgesic ladder guides stepwise pain relief. Step 1 (mild pain) uses non-opioids such as paracetamol or NSAIDs, with adjuvants where appropriate. Step 2 (moderate pain) adds a weak opioid such as codeine. Step 3 (severe pain) uses a strong opioid such as morphine, titrated to effect. Analgesics should be given by mouth where possible, by the clock (regularly rather than only as needed), by the ladder, and individualised to the patient. Anticipate and treat opioid side effects, especially constipation, and use adjuvants (antidepressants, anticonvulsants) for neuropathic pain."),

    ("WHO - Antenatal Care", "who", "https://www.who.int/publications/i/item/9789241549912", "A",
     ["obstetrics", "primary_care"], "Antenatal care",
     "WHO recommends a minimum of eight antenatal care contacts to reduce perinatal mortality and improve experience of care. Core interventions include nutritional counselling and iron-folic acid supplementation to prevent maternal anaemia and neural tube defects, blood pressure measurement and urinalysis to detect pre-eclampsia, screening for anaemia, syphilis, HIV and gestational diabetes, tetanus vaccination, and ultrasound before 24 weeks for accurate dating. Danger signs - vaginal bleeding, severe headache, visual disturbance, reduced fetal movements - should prompt urgent assessment."),

    ("WHO - Postpartum Haemorrhage", "who", "https://www.who.int/publications/i/item/9789241548502", "A",
     ["obstetrics", "emergency"], "Postpartum haemorrhage",
     "Postpartum haemorrhage (PPH) - blood loss >= 500 mL after vaginal birth or >= 1000 mL after caesarean - is a leading cause of maternal death. The commonest cause is uterine atony. Active management of the third stage of labour, with prophylactic oxytocin, prevents most PPH. Treatment follows the 'four Ts' (tone, trauma, tissue, thrombin): give uterotonics (oxytocin first-line, then ergometrine, misoprostol or carboprost), perform uterine massage, ensure the placenta is complete, repair trauma, and correct coagulopathy. Tranexamic acid given early reduces death from bleeding. Escalate to balloon tamponade or surgery if bleeding continues."),

    ("NICE - Fever in Under 5s (Traffic Light)", "nice", "https://www.nice.org.uk/guidance/ng143", "A",
     ["paediatrics", "emergency"], "Paediatric fever assessment",
     "NICE NG143 uses a traffic-light system to assess risk of serious illness in feverish children under 5. Red (high-risk) features include pale/mottled/blue skin, no response to social cues, weak or continuous cry, grunting, tachypnoea, reduced skin turgor and a non-blanching rash. Measure temperature, heart rate, respiratory rate and capillary refill. Any child with a non-blanching rash, looking unwell, or with red features needs urgent assessment for serious bacterial infection including meningococcal disease. Antipyretics are for distress, not solely to reduce temperature, and do not prevent febrile convulsions."),

    ("StatPearls - Diabetic Ketoacidosis", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK534848/", "A",
     ["endocrinology", "emergency"], "Diabetic ketoacidosis",
     "Diabetic ketoacidosis (DKA) is an emergency defined by hyperglycaemia (usually > 11 mmol/L), ketonaemia/ketonuria, and metabolic acidosis (pH < 7.3 or bicarbonate < 15). It is often precipitated by infection, missed insulin, or new-onset type 1 diabetes. Management priorities are fluid resuscitation with isotonic saline, a fixed-rate intravenous insulin infusion, and careful potassium replacement (insulin drives potassium intracellularly, risking hypokalaemia). Monitor glucose, ketones, pH and electrolytes hourly, add dextrose when glucose falls below 14 mmol/L, identify and treat the precipitant, and continue until ketosis and acidosis resolve."),

    ("StatPearls - Hypothyroidism", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK519536/", "B",
     ["endocrinology"], "Hypothyroidism",
     "Hypothyroidism results from underactivity of the thyroid gland, most commonly due to autoimmune (Hashimoto) thyroiditis or, worldwide, iodine deficiency. Symptoms include fatigue, weight gain, cold intolerance, constipation, dry skin and bradycardia. Diagnosis shows a raised TSH with low free T4 in primary hypothyroidism. Treatment is lifelong levothyroxine, titrated to normalise TSH, with dose adjustments in pregnancy (requirements increase). Subclinical hypothyroidism (raised TSH, normal T4) may be treated if symptomatic, if TSH is markedly elevated, or in pregnancy."),

    ("StatPearls - Atrial Fibrillation", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK526072/", "A",
     ["cardiology"], "Atrial fibrillation",
     "Atrial fibrillation (AF) is an irregularly irregular supraventricular arrhythmia and the most common sustained arrhythmia, increasing stroke risk fivefold. Management has two strands: stroke prevention and symptom control. Estimate stroke risk with CHA2DS2-VASc and offer anticoagulation (DOAC preferred) when indicated, balancing bleeding risk. Rate control with a beta-blocker or rate-limiting calcium-channel blocker is first-line for most; rhythm control (antiarrhythmics or catheter ablation) is used for ongoing symptoms. Investigate and treat reversible precipitants such as thyrotoxicosis, sepsis and electrolyte disturbance."),

    ("StatPearls - Pulmonary Embolism", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK560551/", "A",
     ["respiratory", "cardiology", "emergency"], "Pulmonary embolism",
     "Pulmonary embolism (PE) usually arises from deep vein thrombosis and presents with dyspnoea, pleuritic chest pain, tachycardia and sometimes haemoptysis or syncope. Use a clinical probability score (Wells); low probability with a negative D-dimer excludes PE, while higher probability warrants CT pulmonary angiography. Treat with anticoagulation - a DOAC for most haemodynamically stable patients. Massive PE with haemodynamic instability is treated with thrombolysis. Assess for provoking factors and underlying malignancy, and determine duration of anticoagulation based on whether the event was provoked or unprovoked."),

    ("CDC - Adult and Childhood Immunization", "cdc", "https://www.cdc.gov/vaccines/schedules/", "A",
     ["preventive_medicine", "paediatrics"], "Immunisation schedules",
     "CDC immunization schedules summarise recommended vaccines by age and risk. Routine childhood vaccines protect against diphtheria, tetanus, pertussis, polio, Haemophilus influenzae type b, hepatitis B, pneumococcus, rotavirus, measles, mumps, rubella and varicella, with HPV in adolescence. Adults need tetanus-diphtheria boosters, annual influenza vaccine, COVID-19 vaccination per current guidance, and age-based pneumococcal and herpes zoster vaccines. Vaccination prevents disease and supports herd immunity; contraindications are few (e.g. anaphylaxis to a component, and live vaccines in significant immunosuppression or pregnancy)."),

    ("CDC / NICE - Lipid Management and Statins", "cdc", "https://www.cdc.gov/cholesterol/", "A",
     ["cardiology", "preventive_medicine"], "Lipid management",
     "Lowering LDL cholesterol reduces atherosclerotic cardiovascular disease. Statins are first-line; high-intensity statins (e.g. atorvastatin 20-80 mg) are used for established cardiovascular disease (secondary prevention) and for primary prevention when 10-year CVD risk is elevated (NICE uses a >=10% QRISK threshold). Lifestyle measures - diet, physical activity, smoking cessation, weight management - underpin treatment. Check lipids and liver enzymes before and after starting, and add ezetimibe or a PCSK9 inhibitor if LDL targets are not met. Muscle symptoms should be assessed but are uncommonly due to true statin myopathy."),

    ("StatPearls - Ischaemic Stroke", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK499997/", "A",
     ["neurology", "emergency"], "Acute ischaemic stroke",
     "Stroke is sudden neurological deficit from a vascular cause; about 85% are ischaemic. Recognise with FAST (Face, Arm, Speech, Time) and confirm with urgent non-contrast CT to exclude haemorrhage. Eligible patients with ischaemic stroke receive intravenous thrombolysis (alteplase or tenecteplase) within 4.5 hours of onset, and mechanical thrombectomy for large-vessel occlusion within an extended window in selected patients. After the acute phase, give antiplatelet therapy, high-intensity statin, blood-pressure control, and manage atrial fibrillation with anticoagulation. Early swallowing assessment and rehabilitation improve outcomes."),

    ("StatPearls - GORD and Peptic Ulcer Disease", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK441938/", "B",
     ["gastroenterology"], "GORD and peptic ulcer disease",
     "Gastro-oesophageal reflux disease (GORD) causes heartburn and regurgitation from reflux of gastric contents; management combines lifestyle measures (weight loss, avoiding triggers, raising the head of the bed) with proton-pump inhibitors. Peptic ulcer disease is most often caused by Helicobacter pylori infection or NSAID use. Test for H. pylori and, if positive, give eradication therapy (a PPI plus two antibiotics). Stop or co-prescribe gastroprotection with NSAIDs. Alarm features - dysphagia, weight loss, anaemia, GI bleeding, persistent vomiting or age with new symptoms - warrant urgent endoscopy."),

    ("WHO - Hepatitis B", "who", "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b", "A",
     ["gastroenterology", "infectious_disease"], "Hepatitis B",
     "Hepatitis B virus (HBV) is transmitted through blood and body fluids, including perinatally, and can cause acute and chronic infection leading to cirrhosis and hepatocellular carcinoma. Diagnosis uses serology: HBsAg indicates current infection, anti-HBs indicates immunity, and HBeAg and HBV DNA reflect replication and infectivity. Vaccination, including a timely birth dose, is the cornerstone of prevention. Chronic hepatitis B is monitored for liver inflammation and fibrosis; antiviral therapy with tenofovir or entecavir is given when criteria are met. Hepatocellular carcinoma surveillance is recommended for those at risk."),

    ("CDC / NICE - Obesity Management", "cdc", "https://www.cdc.gov/obesity/", "B",
     ["endocrinology", "preventive_medicine"], "Obesity management",
     "Obesity (BMI >= 30 kg/m2; >= 27.5 in some Asian populations) raises the risk of type 2 diabetes, cardiovascular disease, several cancers and osteoarthritis. First-line management is a multicomponent lifestyle programme combining dietary change, increased physical activity and behavioural support to achieve sustained energy deficit. Pharmacotherapy, including GLP-1 receptor agonists (e.g. semaglutide), is added for selected patients alongside lifestyle measures. Bariatric surgery is considered for severe obesity or obesity with comorbidity when other measures fail. Waist circumference and comorbidity assessment guide intensity of treatment."),

    ("WHO - Tuberculosis Treatment Regimen", "who", "https://www.who.int/teams/global-tuberculosis-programme", "A",
     ["infectious_disease", "respiratory"], "Tuberculosis treatment",
     "Drug-susceptible pulmonary tuberculosis is treated with a standard regimen: an intensive phase of two months with isoniazid, rifampicin, pyrazinamide and ethambutol, followed by a continuation phase of four months with isoniazid and rifampicin. Treatment adherence is critical to prevent relapse and resistance; directly observed or digitally supported therapy is used where appropriate. Monitor for hepatotoxicity and give pyridoxine to prevent isoniazid neuropathy. Drug-resistant TB requires longer regimens with second-line agents. Contact tracing, infection control, and screening of household contacts are essential public-health measures."),

    ("NICE - Generalised Anxiety Disorder", "nice", "https://www.nice.org.uk/guidance/cg113", "A",
     ["mental_health"], "Generalised anxiety disorder",
     "Generalised anxiety disorder (GAD) features excessive, hard-to-control worry on most days for at least six months, with restlessness, fatigue, poor concentration, irritability, muscle tension and sleep disturbance. NICE recommends a stepped-care model: education and active monitoring first, then low-intensity psychological interventions, then high-intensity cognitive behavioural therapy or drug treatment for marked functional impairment. An SSRI is first-line pharmacotherapy; if ineffective, try an alternative SSRI or an SNRI. Benzodiazepines are not recommended beyond short-term crisis use because of dependence."),

    ("StatPearls - Hyperkalaemia", "statpearls", "https://www.ncbi.nlm.nih.gov/books/NBK470284/", "A",
     ["nephrology", "emergency"], "Hyperkalaemia",
     "Hyperkalaemia (serum potassium > 5.5 mmol/L) can cause life-threatening arrhythmias. Causes include renal impairment, potassium-sparing drugs (ACE inhibitors, ARBs, spironolactone), acidosis and tissue breakdown. ECG changes progress from tall tented T waves to widened QRS and a sine-wave pattern. Emergency treatment of severe or ECG-positive hyperkalaemia is intravenous calcium gluconate to stabilise the myocardium, followed by insulin with glucose and nebulised salbutamol to shift potassium intracellularly, and measures to remove potassium (diuretics, potassium binders, or dialysis). Identify and treat the cause and review contributing medications."),

    ("WHO - Pre-eclampsia and Hypertension in Pregnancy", "who", "https://www.who.int/publications/i/item/9789241548335", "A",
     ["obstetrics", "emergency"], "Pre-eclampsia",
     "Pre-eclampsia is new-onset hypertension after 20 weeks of pregnancy with proteinuria or maternal organ dysfunction. It can progress to eclampsia (seizures) and HELLP syndrome. WHO recommends low-dose aspirin from early pregnancy for women at high risk, and calcium supplementation where dietary intake is low. Magnesium sulfate is the drug of choice both to treat eclamptic seizures and to prevent them in severe pre-eclampsia. Antihypertensives (labetalol, nifedipine, methyldopa) control blood pressure. The definitive treatment is delivery, timed by balancing maternal and fetal risks."),
]


def _vec_literal(vec) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"


async def main() -> None:
    conn = await asyncpg.connect(**DB)
    contents = [c[6] for c in CORPUS]
    print(f"embedding {len(contents)} chunks...")
    embeddings = await embed_documents(contents)

    inserted, skipped = 0, 0
    for (name, stype, url, grade, tags, section, content), emb in zip(CORPUS, embeddings):
        exists = await conn.fetchval("SELECT 1 FROM knowledge_chunks WHERE content=$1", content)
        if exists:
            skipped += 1
            continue
        # Map to an allowed source_type (StatPearls -> textbook); the display
        # name still reads "StatPearls - ..." for the citation.
        allowed = {"pubmed", "who", "cdc", "nice", "cochrane", "textbook", "guideline", "journal", "custom", "web"}
        stype_norm = stype if stype in allowed else "textbook"
        source_id = await conn.fetchval(
            """INSERT INTO knowledge_sources (name, source_type, url, evidence_grade,
                   specialty_tags, ingestion_status, chunk_count, is_active)
               VALUES ($1,$2,$3,$4,$5,'completed',1,TRUE) RETURNING id""",
            name, stype_norm, url, grade, tags,
        )
        meta = f'{{"url": {url!r}, "source_name": {name!r}, "evidence_grade": {grade!r}}}'.replace("'", '"')
        await conn.execute(
            """INSERT INTO knowledge_chunks (source_id, content, embedding,
                   chunk_index, section_title, metadata, specialty_tags)
               VALUES ($1,$2,$3::vector,0,$4,$5::jsonb,$6)""",
            source_id, content, _vec_literal(emb), section, meta, tags,
        )
        inserted += 1
    total = await conn.fetchval("SELECT count(*) FROM knowledge_chunks")
    await conn.close()
    print(f"inserted {inserted}, skipped {skipped} (already present). total chunks now: {total}")


if __name__ == "__main__":
    asyncio.run(main())
