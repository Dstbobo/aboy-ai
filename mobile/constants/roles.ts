// ─────────────────────────────────────────────────────────────
// Aboy AI — Role & Specialty Registry (5 categories)
//   students / professionals / hospital operations / educators / researchers
// Role ids are prefixed strings: student_* pro_* ops_* edu_* res_* (+ admin)
// ─────────────────────────────────────────────────────────────

export type UserRole = string;

export interface RoleOption {
  id: UserRole;
  label: string;
  icon: string;
}

export interface RoleCategory {
  id: 'students' | 'professionals' | 'operations' | 'educators' | 'researchers';
  label: string;
  description: string;
  icon: string; // MaterialCommunityIcons name
  roles: RoleOption[];
}

// ── Students — healthcare courses worldwide (incl. all therapy students) ──
export const STUDENT_ROLES: RoleOption[] = [
  { id: 'student_med',              label: 'Medical Student',                    icon: '🩺' },
  { id: 'student_nurse',            label: 'Nursing Student',                    icon: '💉' },
  { id: 'student_midwifery',        label: 'Midwifery Student',                  icon: '🤰' },
  { id: 'student_physio',           label: 'Physiotherapy Student',              icon: '🏃' },
  { id: 'student_ot',               label: 'Occupational Therapy Student',       icon: '🖐️' },
  { id: 'student_slt',              label: 'Speech & Language Therapy Student',  icon: '🗣️' },
  { id: 'student_resp_therapy',     label: 'Respiratory Therapy Student',        icon: '🫁' },
  { id: 'student_rad_therapy',      label: 'Radiation Therapy Student',          icon: '☢️' },
  { id: 'student_pharmacy',         label: 'Pharmacy Student',                   icon: '💊' },
  { id: 'student_dental',           label: 'Dental Student',                     icon: '🦷' },
  { id: 'student_radiography',      label: 'Radiography Student',                icon: '📡' },
  { id: 'student_med_lab',          label: 'Medical Laboratory Student',         icon: '🧪' },
  { id: 'student_biomedical',       label: 'Biomedical Science Student',         icon: '🧬' },
  { id: 'student_community_health', label: 'Community Health Student',           icon: '🏘️' },
  { id: 'student_env_health',       label: 'Environmental Health Student',       icon: '🌿' },
  { id: 'student_nutrition',        label: 'Nutrition & Dietetics Student',      icon: '🥗' },
  { id: 'student_optometry',        label: 'Optometry Student',                  icon: '👁️' },
  { id: 'student_paramedic',        label: 'Paramedic Student',                  icon: '🚑' },
  { id: 'student_psychology',       label: 'Psychology Student',                 icon: '🧠' },
  { id: 'student_public_health',    label: 'Public Health Student',              icon: '🌍' },
  { id: 'student_health_info',      label: 'Health Information Student',         icon: '📊' },
  { id: 'student_audiology',        label: 'Audiology Student',                  icon: '👂' },
  { id: 'student_podiatry',         label: 'Podiatry Student',                   icon: '🦶' },
  { id: 'student_chiropractic',     label: 'Chiropractic Student',               icon: '🦴' },
  { id: 'student_anesthesia_tech',  label: 'Anaesthesia Technology Student',     icon: '😴' },
  { id: 'student_other',            label: 'Other Healthcare Student',           icon: '🎓' },
];

// ── Professionals — clinical roles (incl. all qualified therapists) ──
export const PROFESSIONAL_ROLES: RoleOption[] = [
  { id: 'pro_junior',           label: 'Junior Doctor',                    icon: '👨‍⚕️' },
  { id: 'pro_senior',           label: 'Senior Clinician / Consultant',    icon: '🏥' },
  { id: 'pro_nurse',            label: 'Registered Nurse',                 icon: '💉' },
  { id: 'pro_midwife',          label: 'Midwife',                          icon: '🤰' },
  { id: 'pro_physio',           label: 'Physiotherapist',                  icon: '🏃' },
  { id: 'pro_ot',               label: 'Occupational Therapist',           icon: '🖐️' },
  { id: 'pro_slt',              label: 'Speech & Language Therapist',      icon: '🗣️' },
  { id: 'pro_resp_therapist',   label: 'Respiratory Therapist',            icon: '🫁' },
  { id: 'pro_rad_therapist',    label: 'Radiation Therapist',              icon: '☢️' },
  { id: 'pro_pharmacist',       label: 'Pharmacist',                       icon: '💊' },
  { id: 'pro_dentist',          label: 'Dentist',                          icon: '🦷' },
  { id: 'pro_radiographer',     label: 'Radiographer',                     icon: '📡' },
  { id: 'pro_med_lab',          label: 'Medical Laboratory Scientist',     icon: '🧪' },
  { id: 'pro_community_health', label: 'Community Health Officer',         icon: '🏘️' },
  { id: 'pro_paramedic',        label: 'Paramedic',                        icon: '🚑' },
  { id: 'pro_dietitian',        label: 'Dietitian / Nutritionist',         icon: '🥗' },
  { id: 'pro_optometrist',      label: 'Optometrist',                      icon: '👁️' },
  { id: 'pro_psychologist',     label: 'Psychologist',                     icon: '🧠' },
  { id: 'pro_public_health',    label: 'Public Health Officer',            icon: '🌍' },
  { id: 'pro_env_health',       label: 'Environmental Health Officer',     icon: '🌿' },
  { id: 'pro_audiologist',      label: 'Audiologist',                      icon: '👂' },
  { id: 'pro_podiatrist',       label: 'Podiatrist',                       icon: '🦶' },
  { id: 'pro_anesthetist',      label: 'Anaesthetist / Nurse Anaesthetist', icon: '😴' },
  { id: 'pro_biomedical',       label: 'Biomedical Scientist',             icon: '🧬' },
  { id: 'pro_other',            label: 'Other Clinical Professional',      icon: '⚕️' },
];

// ── Hospital Operations — non-clinical staff ──
export const OPERATIONS_ROLES: RoleOption[] = [
  { id: 'ops_cashier',        label: 'Cashier',                  icon: '💵' },
  { id: 'ops_receptionist',   label: 'Receptionist',             icon: '🛎️' },
  { id: 'ops_ward_manager',   label: 'Ward Manager',             icon: '🛏️' },
  { id: 'ops_lab_tech',       label: 'Lab Technician',           icon: '🔬' },
  { id: 'ops_billing',        label: 'Billing Officer',          icon: '🧾' },
  { id: 'ops_admin',          label: 'Administrator',            icon: '🗂️' },
  { id: 'ops_it',             label: 'IT Officer',               icon: '💻' },
  { id: 'ops_hr',             label: 'HR Officer',               icon: '🧑‍💼' },
  { id: 'ops_security',       label: 'Security Officer',         icon: '🛡️' },
  { id: 'ops_kitchen',        label: 'Kitchen Staff',            icon: '🍽️' },
  { id: 'ops_laundry',        label: 'Laundry Staff',            icon: '🧺' },
  { id: 'ops_maintenance',    label: 'Maintenance Staff',        icon: '🔧' },
  { id: 'ops_records',        label: 'Medical Records Officer',  icon: '📁' },
  { id: 'ops_porter',         label: 'Porter',                   icon: '🛒' },
];

// ── Educators ──
export const EDUCATOR_ROLES: RoleOption[] = [
  { id: 'edu_lecturer',        label: 'Lecturer',                 icon: '👩‍🏫' },
  { id: 'edu_clinical_tutor',  label: 'Clinical Tutor',           icon: '🩺' },
  { id: 'edu_curriculum',      label: 'Curriculum Designer',      icon: '📐' },
  { id: 'edu_faculty',         label: 'Medical School Faculty',   icon: '🏛️' },
  { id: 'edu_skills_trainer',  label: 'Clinical Skills Trainer',  icon: '🤲' },
  { id: 'edu_sim',             label: 'Simulation Educator',      icon: '🦾' },
];

// ── Researchers ──
export const RESEARCHER_ROLES: RoleOption[] = [
  { id: 'res_clinical',      label: 'Clinical Researcher',         icon: '🔬' },
  { id: 'res_biomedical',    label: 'Biomedical Researcher',       icon: '🧬' },
  { id: 'res_public_health', label: 'Public Health Investigator',  icon: '🌍' },
  { id: 'res_epidemiology',  label: 'Epidemiologist',              icon: '📈' },
  { id: 'res_policy',        label: 'Health Policy Researcher',    icon: '📜' },
  { id: 'res_data',          label: 'Medical Data Scientist',      icon: '📊' },
];

export const ROLE_CATEGORIES: RoleCategory[] = [
  {
    id: 'students',
    label: 'Students',
    description: 'Every healthcare course and programme worldwide',
    icon: 'school-outline',
    roles: STUDENT_ROLES,
  },
  {
    id: 'professionals',
    label: 'Professionals',
    description: 'Clinical departments and qualified practitioners',
    icon: 'stethoscope',
    roles: PROFESSIONAL_ROLES,
  },
  {
    id: 'operations',
    label: 'Hospital Operations',
    description: 'Non-clinical hospital staff',
    icon: 'office-building-outline',
    roles: OPERATIONS_ROLES,
  },
  {
    id: 'educators',
    label: 'Educators',
    description: 'Teaching, training and curriculum roles',
    icon: 'human-male-board',
    roles: EDUCATOR_ROLES,
  },
  {
    id: 'researchers',
    label: 'Researchers',
    description: 'Clinical and health research roles',
    icon: 'flask-outline',
    roles: RESEARCHER_ROLES,
  },
];

const ALL_ROLES: RoleOption[] = [
  ...STUDENT_ROLES,
  ...PROFESSIONAL_ROLES,
  ...OPERATIONS_ROLES,
  ...EDUCATOR_ROLES,
  ...RESEARCHER_ROLES,
  { id: 'admin', label: 'Admin', icon: '🛡️' },
  // Legacy ids kept resolvable so existing accounts keep their labels
  { id: 'educator', label: 'Educator', icon: '👩‍🏫' },
  { id: 'pro_dental', label: 'Dentist', icon: '🦷' },
  { id: 'student_health_info', label: 'Health Information Student', icon: '📊' },
  { id: 'pro_health_info_mgr', label: 'Health Information Manager', icon: '📊' },
];

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_ROLES.map((r) => [r.id, r.label]),
);

export function getRoleIcon(role: UserRole): string {
  return ALL_ROLES.find((r) => r.id === role)?.icon ?? '👤';
}

// ── Specialties (used by onboarding step 2; roles without an entry skip it) ──
export const ROLE_SPECIALTIES: Record<string, string[]> = {
  student_med: [
    'General Medicine','Surgery','Pediatrics','Psychiatry','Radiology','Pathology',
    'Obstetrics & Gynecology','Anaesthesia','Ophthalmology','ENT','Dermatology',
    'Emergency Medicine','Family Medicine','Neurology','Cardiology',
  ],
  student_nurse: [
    'General Nursing','Pediatric Nursing','ICU / Critical Care','Theater / OR',
    'Mental Health Nursing','Oncology Nursing','Renal Nursing','Neonatal Nursing',
    'Accident & Emergency','Gerontology',
  ],
  student_physio: ['Musculoskeletal','Neurological','Cardiorespiratory','Pediatric','Sports & Exercise','Community Rehabilitation'],
  student_ot: ['Physical Rehabilitation','Mental Health OT','Pediatric OT','Community OT','Geriatric OT'],
  student_slt: ['Pediatric Speech Therapy','Adult Neurological','Voice Disorders','Fluency Disorders','Augmentative Communication'],
  student_pharmacy: ['Clinical Pharmacy','Community Pharmacy','Industrial Pharmacy','Pharmaceutical Sciences','Pharmacology'],
  student_dental: ['General Dentistry','Oral Surgery','Orthodontics','Pediatric Dentistry','Periodontics','Endodontics','Prosthodontics'],
  student_radiography: ['Diagnostic Radiography','Therapeutic Radiography','Nuclear Medicine','Ultrasound','MRI'],
  student_med_lab: ['Hematology','Microbiology','Chemical Pathology','Histopathology','Blood Transfusion Science','Immunology'],
  student_midwifery: ['Direct Entry Midwifery','Post-RN Midwifery','BSc Midwifery','Advanced Midwifery Practice'],
  student_community_health: ['Primary Health Care','Disease Control & Prevention','Health Promotion','Epidemiology','Maternal & Child Health'],
  pro_junior: ['Intern / Houseman','General Practice','Internal Medicine','Surgery','Pediatrics','Obstetrics & Gynecology','Psychiatry','Emergency Medicine','Anaesthesia','Family Medicine'],
  pro_senior: ['General Medicine','Surgery','Cardiology','Pediatrics','Obstetrics & Gynecology','Psychiatry','Neurology','Oncology','Radiology','Pathology','Anaesthesia','Emergency Medicine','Nephrology','Endocrinology','Gastroenterology','Orthopedics','Infectious Disease'],
  pro_nurse: ['General Nursing','ICU / Critical Care','Theater / OR','Community Health Nursing','Mental Health Nursing','Pediatric Nursing','Oncology Nursing','Renal / Dialysis','Neonatal','Accident & Emergency','Gerontology'],
  pro_physio: ['Musculoskeletal','Neurological','Cardiorespiratory','Pediatric','Sports & Exercise','Community Rehabilitation','Occupational Health'],
  pro_ot: ['Physical Rehabilitation','Mental Health','Pediatrics','Community','Geriatrics','Hand Therapy'],
  pro_slt: ['Pediatric Speech Therapy','Adult Neurological','Voice Disorders','Dysphagia','Augmentative Communication'],
  pro_pharmacist: ['Hospital Pharmacy','Community Pharmacy','Clinical Pharmacy','Industrial / Manufacturing','Regulatory Affairs','Oncology Pharmacy'],
  pro_dentist: ['General Dentistry','Oral Surgery','Orthodontics','Pediatric Dentistry','Periodontics','Endodontics','Prosthodontics','Public Health Dentistry'],
  pro_midwife: ['Hospital Midwifery','Community Midwifery','Birth Center','High Risk Obstetrics','Neonatal Care'],
  pro_radiographer: ['Diagnostic Radiography','Therapeutic Radiography','Nuclear Medicine','Ultrasound','MRI','CT Scanning'],
  pro_med_lab: ['Hematology','Microbiology','Chemical Pathology','Histopathology','Blood Transfusion','Immunology','Virology'],
  pro_dietitian: ['Clinical Dietetics','Community Nutrition','Sports Nutrition','Pediatric Nutrition','Renal Dietetics','Oncology Nutrition'],
  res_clinical: ['Clinical Trials','Drug Development','Translational Research','Outcomes Research'],
  res_epidemiology: ['Infectious Disease','Chronic Disease','Field Epidemiology','Genetic Epidemiology'],
  edu_lecturer: ['Medicine','Nursing','Pharmacy','Allied Health','Public Health','Basic Sciences'],
};

// ── Category helpers ──
export function isStudentRole(role: UserRole): boolean {
  return role.startsWith('student_');
}
export function isProRole(role: UserRole): boolean {
  return role.startsWith('pro_');
}
export function isOpsRole(role: UserRole): boolean {
  return role.startsWith('ops_');
}
export function isEducatorRole(role: UserRole): boolean {
  return role.startsWith('edu_') || role === 'educator';
}
export function isResearcherRole(role: UserRole): boolean {
  return role.startsWith('res_');
}
export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

// Legacy export — superseded by getDrawerItems(); kept so old imports compile.
export const ROLE_TABS: Record<string, string[]> = {};
