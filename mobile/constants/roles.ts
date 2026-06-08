// ─────────────────────────────────────────────────────────────
// Aboy AI — Complete Role & Specialty Registry
// ─────────────────────────────────────────────────────────────

export type UserRole =
  // Students
  | 'student_med'
  | 'student_nurse'
  | 'student_midwifery'
  | 'student_community_health'
  | 'student_pharmacy'
  | 'student_dental'
  | 'student_physio'
  | 'student_radiography'
  | 'student_med_lab'
  | 'student_biomedical'
  | 'student_optometry'
  | 'student_nutrition'
  | 'student_ot'
  | 'student_health_info'
  | 'student_env_health'
  | 'student_slt'
  // Professionals
  | 'pro_junior'
  | 'pro_senior'
  | 'pro_nurse'
  | 'pro_midwife'
  | 'pro_community_health'
  | 'pro_pharmacist'
  | 'pro_dentist'
  | 'pro_physio'
  | 'pro_radiographer'
  | 'pro_med_lab'
  | 'pro_biomedical'
  | 'pro_optometrist'
  | 'pro_dietitian'
  | 'pro_ot'
  | 'pro_health_info_mgr'
  | 'pro_env_health'
  | 'pro_paramedic'
  | 'pro_public_health'
  // System
  | 'admin'
  | 'educator';

export interface RoleOption {
  id: UserRole;
  label: string;
  icon: string;
}

export const STUDENT_ROLES: RoleOption[] = [
  { id: 'student_med',             label: 'Medical Student',                  icon: '🩺' },
  { id: 'student_nurse',           label: 'Nursing Student',                  icon: '💉' },
  { id: 'student_midwifery',       label: 'Midwifery Student',                icon: '🤰' },
  { id: 'student_community_health',label: 'Community Health Student',         icon: '🏘️' },
  { id: 'student_pharmacy',        label: 'Pharmacy Student',                 icon: '💊' },
  { id: 'student_dental',          label: 'Dental Student',                   icon: '🦷' },
  { id: 'student_physio',          label: 'Physiotherapy Student',            icon: '🏃' },
  { id: 'student_radiography',     label: 'Radiography Student',              icon: '🔬' },
  { id: 'student_med_lab',         label: 'Medical Laboratory Student',       icon: '🧪' },
  { id: 'student_biomedical',      label: 'Biomedical Science Student',       icon: '🧬' },
  { id: 'student_optometry',       label: 'Optometry Student',                icon: '👁️' },
  { id: 'student_nutrition',       label: 'Nutrition & Dietetics Student',    icon: '🥗' },
  { id: 'student_ot',              label: 'Occupational Therapy Student',     icon: '🖐️' },
  { id: 'student_health_info',     label: 'Health Information Student',       icon: '📊' },
  { id: 'student_env_health',      label: 'Environmental Health Student',     icon: '🌿' },
  { id: 'student_slt',             label: 'Speech & Language Therapy Student',icon: '🗣️' },
];

export const PROFESSIONAL_ROLES: RoleOption[] = [
  { id: 'pro_junior',          label: 'Junior Doctor',               icon: '👨‍⚕️' },
  { id: 'pro_senior',          label: 'Senior Clinician / Consultant',icon: '🏥' },
  { id: 'pro_nurse',           label: 'Registered Nurse',             icon: '💉' },
  { id: 'pro_midwife',         label: 'Midwife',                      icon: '🤰' },
  { id: 'pro_community_health',label: 'Community Health Officer',     icon: '🏘️' },
  { id: 'pro_pharmacist',      label: 'Pharmacist',                   icon: '💊' },
  { id: 'pro_dentist',         label: 'Dentist',                      icon: '🦷' },
  { id: 'pro_physio',          label: 'Physiotherapist',              icon: '🏃' },
  { id: 'pro_radiographer',    label: 'Radiographer',                 icon: '📡' },
  { id: 'pro_med_lab',         label: 'Medical Laboratory Scientist', icon: '🧪' },
  { id: 'pro_biomedical',      label: 'Biomedical Scientist',         icon: '🧬' },
  { id: 'pro_optometrist',     label: 'Optometrist',                  icon: '👁️' },
  { id: 'pro_dietitian',       label: 'Dietitian / Nutritionist',     icon: '🥗' },
  { id: 'pro_ot',              label: 'Occupational Therapist',       icon: '🖐️' },
  { id: 'pro_health_info_mgr', label: 'Health Information Manager',   icon: '📊' },
  { id: 'pro_env_health',      label: 'Environmental Health Officer', icon: '🌿' },
  { id: 'pro_paramedic',       label: 'Paramedic',                    icon: '🚑' },
  { id: 'pro_public_health',   label: 'Public Health Officer',        icon: '🌍' },
];

// ── Specialties per role ────────────────────────────────────
export const ROLE_SPECIALTIES: Record<UserRole, string[]> = {
  student_med: [
    'General Medicine','Surgery','Pediatrics','Psychiatry','Radiology',
    'Pathology','Obstetrics & Gynecology','Anaesthesia','Ophthalmology',
    'ENT','Dermatology','Emergency Medicine','Family Medicine',
    'Neurology','Cardiology',
  ],
  student_nurse: [
    'General Nursing','Pediatric Nursing','ICU / Critical Care Nursing',
    'Theater / OR Nursing','Mental Health Nursing','Oncology Nursing',
    'Renal Nursing','Neonatal Nursing','Accident & Emergency Nursing',
    'Gerontology Nursing',
  ],
  student_midwifery: [
    'Direct Entry Midwifery','Post-RN Midwifery','BSc Midwifery',
    'Advanced Midwifery Practice',
  ],
  student_community_health: [
    'Primary Health Care','Disease Control & Prevention',
    'Health Promotion & Education','Epidemiology','Environmental Health',
    'Maternal & Child Health','School Health','Occupational Health',
  ],
  student_pharmacy: [
    'Clinical Pharmacy','Community Pharmacy','Industrial Pharmacy',
    'Pharmaceutical Sciences','Pharmacology',
  ],
  student_dental: [
    'General Dentistry','Oral Surgery','Orthodontics',
    'Pediatric Dentistry','Periodontics','Endodontics','Prosthodontics',
  ],
  student_physio: [
    'Musculoskeletal','Neurological','Cardiorespiratory',
    'Pediatric Physiotherapy','Sports & Exercise','Community Rehabilitation',
  ],
  student_radiography: [
    'Diagnostic Radiography','Therapeutic Radiography',
    'Nuclear Medicine','Ultrasound','MRI',
  ],
  student_med_lab: [
    'Hematology','Microbiology','Chemical Pathology',
    'Histopathology','Blood Transfusion Science','Immunology',
  ],
  student_biomedical: [
    'Clinical Biochemistry','Medical Microbiology','Immunology',
    'Genetics','Pharmacology Research',
  ],
  student_optometry: [
    'General Optometry','Pediatric Optometry','Low Vision',
    'Contact Lens Practice','Community Optometry',
  ],
  student_nutrition: [
    'Clinical Nutrition','Community Nutrition','Sports Nutrition',
    'Food Science','Public Health Nutrition',
  ],
  student_ot: [
    'Physical Rehabilitation','Mental Health OT','Pediatric OT',
    'Community OT','Geriatric OT',
  ],
  student_health_info: [
    'Health Records Management','Health Informatics',
    'Medical Coding','Healthcare Data Analytics',
  ],
  student_env_health: [
    'Food Safety & Hygiene','Waste Management',
    'Occupational Health & Safety','Vector Control','Water & Sanitation',
  ],
  student_slt: [
    'Pediatric Speech Therapy','Adult Neurological','Voice Disorders',
    'Fluency Disorders','Augmentative Communication',
  ],
  pro_junior: [
    'Intern / Houseman','General Practice','Internal Medicine','Surgery',
    'Pediatrics','Obstetrics & Gynecology','Psychiatry',
    'Emergency Medicine','Anaesthesia','Family Medicine',
  ],
  pro_senior: [
    'General Medicine','Surgery','Cardiology','Pediatrics',
    'Obstetrics & Gynecology','Psychiatry','Neurology','Oncology',
    'Radiology','Pathology','Anaesthesia','Emergency Medicine',
    'Dermatology','Ophthalmology','ENT','Nephrology','Endocrinology',
    'Gastroenterology','Pulmonology','Rheumatology','Urology',
    'Orthopedics','Hematology','Infectious Disease','Geriatrics',
  ],
  pro_nurse: [
    'General Nursing','ICU / Critical Care','Theater / OR',
    'Community Health Nursing','Mental Health Nursing','Pediatric Nursing',
    'Oncology Nursing','Renal / Dialysis','Neonatal Nursing',
    'Accident & Emergency','Gerontology',
  ],
  pro_midwife: [
    'Hospital Midwifery','Community Midwifery','Birth Center',
    'High Risk Obstetrics','Neonatal Care',
  ],
  pro_community_health: [
    'Primary Health Care','Disease Surveillance','Health Promotion',
    'Maternal & Child Health','Immunization Programs',
    'School Health','Occupational Health',
  ],
  pro_pharmacist: [
    'Hospital Pharmacy','Community Pharmacy','Clinical Pharmacy',
    'Industrial / Manufacturing','Regulatory Affairs','Oncology Pharmacy',
  ],
  pro_dentist: [
    'General Dentistry','Oral Surgery','Orthodontics',
    'Pediatric Dentistry','Periodontics','Endodontics',
    'Prosthodontics','Public Health Dentistry',
  ],
  pro_physio: [
    'Musculoskeletal','Neurological','Cardiorespiratory','Pediatric',
    'Sports & Exercise','Community Rehabilitation','Occupational Health',
  ],
  pro_radiographer: [
    'Diagnostic Radiography','Therapeutic Radiography','Nuclear Medicine',
    'Ultrasound','MRI','CT Scanning',
  ],
  pro_med_lab: [
    'Hematology','Microbiology','Chemical Pathology','Histopathology',
    'Blood Transfusion','Immunology','Virology',
  ],
  pro_biomedical: [
    'Clinical Engineering','Medical Research','Pharmaceutical Research',
    'Genetics & Genomics','Immunology',
  ],
  pro_optometrist: [
    'General Practice','Pediatric Optometry','Low Vision Rehabilitation',
    'Contact Lens','Hospital Optometry',
  ],
  pro_dietitian: [
    'Clinical Dietetics','Community Nutrition','Sports Nutrition',
    'Pediatric Nutrition','Renal Dietetics','Oncology Nutrition',
  ],
  pro_ot: [
    'Physical Rehabilitation','Mental Health','Pediatrics',
    'Community','Geriatrics','Hand Therapy',
  ],
  pro_health_info_mgr: [
    'Health Records','Health Informatics','Medical Coding & Billing',
    'Healthcare Analytics','Quality & Compliance',
  ],
  pro_env_health: [
    'Food Safety & Hygiene','Waste & Sanitation',
    'Occupational Health & Safety','Vector & Disease Control',
    'Environmental Monitoring',
  ],
  pro_paramedic: [
    'Basic Life Support','Advanced Life Support',
    'Critical Care Paramedic','Community Paramedicine','Event Medicine',
  ],
  pro_public_health: [
    'Epidemiology','Health Policy','Disease Control',
    'Health Promotion','Biostatistics','Global Health',
  ],
  admin: [],
  educator: [],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  student_med:             'Medical Student',
  student_nurse:           'Nursing Student',
  student_midwifery:       'Midwifery Student',
  student_community_health:'Community Health Student',
  student_pharmacy:        'Pharmacy Student',
  student_dental:          'Dental Student',
  student_physio:          'Physiotherapy Student',
  student_radiography:     'Radiography Student',
  student_med_lab:         'Medical Laboratory Student',
  student_biomedical:      'Biomedical Science Student',
  student_optometry:       'Optometry Student',
  student_nutrition:       'Nutrition & Dietetics Student',
  student_ot:              'Occupational Therapy Student',
  student_health_info:     'Health Information Student',
  student_env_health:      'Environmental Health Student',
  student_slt:             'Speech & Language Therapy Student',
  pro_junior:              'Junior Doctor',
  pro_senior:              'Senior Clinician / Consultant',
  pro_nurse:               'Registered Nurse',
  pro_midwife:             'Midwife',
  pro_community_health:    'Community Health Officer',
  pro_pharmacist:          'Pharmacist',
  pro_dentist:             'Dentist',
  pro_physio:              'Physiotherapist',
  pro_radiographer:        'Radiographer',
  pro_med_lab:             'Medical Laboratory Scientist',
  pro_biomedical:          'Biomedical Scientist',
  pro_optometrist:         'Optometrist',
  pro_dietitian:           'Dietitian / Nutritionist',
  pro_ot:                  'Occupational Therapist',
  pro_health_info_mgr:     'Health Information Manager',
  pro_env_health:          'Environmental Health Officer',
  pro_paramedic:           'Paramedic',
  pro_public_health:       'Public Health Officer',
  admin:                   'Admin',
  educator:                'Educator',
};

export const ROLE_TABS: Record<string, string[]> = {
  student_med:             ['Chat', 'History', 'Study'],
  student_nurse:           ['Chat', 'History', 'Study'],
  student_midwifery:       ['Chat', 'History', 'Study'],
  student_community_health:['Chat', 'History', 'Study'],
  student_pharmacy:        ['Chat', 'History', 'Study'],
  student_dental:          ['Chat', 'History', 'Study'],
  student_physio:          ['Chat', 'History', 'Study'],
  student_radiography:     ['Chat', 'History', 'Study'],
  student_med_lab:         ['Chat', 'History', 'Study'],
  student_biomedical:      ['Chat', 'History', 'Study'],
  student_optometry:       ['Chat', 'History', 'Study'],
  student_nutrition:       ['Chat', 'History', 'Study'],
  student_ot:              ['Chat', 'History', 'Study'],
  student_health_info:     ['Chat', 'History', 'Study'],
  student_env_health:      ['Chat', 'History', 'Study'],
  student_slt:             ['Chat', 'History', 'Study'],
  pro_junior:              ['Chat', 'History', 'Guidelines'],
  pro_senior:              ['Chat', 'History', 'Guidelines'],
  pro_nurse:               ['Chat', 'History', 'Care Plans'],
  pro_midwife:             ['Chat', 'History', 'Guidelines'],
  pro_community_health:    ['Chat', 'History', 'Study'],
  pro_pharmacist:          ['Chat', 'Drug Reference', 'History'],
  pro_dentist:             ['Chat', 'History', 'Guidelines'],
  pro_physio:              ['Chat', 'History', 'Guidelines'],
  pro_radiographer:        ['Chat', 'History', 'Guidelines'],
  pro_med_lab:             ['Chat', 'History', 'Guidelines'],
  pro_biomedical:          ['Chat', 'History', 'Study'],
  pro_optometrist:         ['Chat', 'History', 'Guidelines'],
  pro_dietitian:           ['Chat', 'History', 'Guidelines'],
  pro_ot:                  ['Chat', 'History', 'Guidelines'],
  pro_health_info_mgr:     ['Chat', 'History', 'Study'],
  pro_env_health:          ['Chat', 'History', 'Guidelines'],
  pro_paramedic:           ['Chat', 'History', 'Guidelines'],
  pro_public_health:       ['Chat', 'History', 'Guidelines'],
  admin:                   ['Chat', 'Users', 'Audit'],
  educator:                ['Chat', 'History', 'Study'],
};

export function isStudentRole(role: UserRole): boolean {
  return role.startsWith('student_');
}

export function isProRole(role: UserRole): boolean {
  return role.startsWith('pro_');
}

export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

export function getRoleIcon(role: UserRole): string {
  const all = [...STUDENT_ROLES, ...PROFESSIONAL_ROLES];
  return all.find(r => r.id === role)?.icon ?? '👤';
}
