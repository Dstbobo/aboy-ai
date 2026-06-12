import React from 'react';
import { PromptHub } from '@/components/shared/PromptHub';
import { useAuthStore } from '@/stores/auth.store';
import { ROLE_LABELS } from '@/constants/roles';

/** Cases — clinical decision support for professionals. */
export default function CasesScreen() {
  const user = useAuthStore((s) => s.user);
  const role = ROLE_LABELS[user?.role ?? ''] ?? 'clinician';
  const me = `I am a ${role}${user?.subRole ? ` (${user.subRole})` : ''}.`;

  return (
    <PromptHub
      title="Cases"
      intro="Work through real cases with evidence-based, cited support."
      actions={[
        {
          icon: 'account-search-outline',
          title: 'Differential diagnosis',
          subtitle: 'Present a case, get a ranked differential with reasoning',
          prompt: `${me} I want to work through a case. Ask me for the presentation (age, sex, symptoms, vitals, history), then give a ranked differential diagnosis with the reasoning, red flags to exclude, and the first-line investigations — all cited.`,
        },
        {
          icon: 'pill',
          title: 'Treatment plan check',
          subtitle: 'Verify management against current guidelines',
          prompt: `${me} I'll describe a patient and my planned management. Compare it against current WHO/NICE guidance, flag anything outdated or unsafe, drug interactions to check, and cite the guideline sections.`,
        },
        {
          icon: 'alert-decagram-outline',
          title: 'Red flags review',
          subtitle: 'What must not be missed for a presentation',
          prompt: `${me} Ask me for a presenting complaint, then list the must-not-miss diagnoses, their red flags, and the immediate actions for each — cited from emergency guidelines.`,
        },
        {
          icon: 'file-chart-outline',
          title: 'Interpret results',
          subtitle: 'Labs, ECGs, imaging reports explained in context',
          prompt: `${me} I'll paste lab results or a report. Interpret them in clinical context: what's abnormal, likely causes, what to do next, and when to escalate — with reference ranges cited.`,
        },
      ]}
    />
  );
}
