import React from 'react';
import { PromptHub } from '@/components/shared/PromptHub';

/** Literature — research workflows for researchers. */
export default function LiteratureScreen() {
  return (
    <PromptHub
      title="Literature"
      intro="Search, appraise and synthesise the evidence — every claim cited."
      actions={[
        {
          icon: 'magnify',
          title: 'Evidence search',
          subtitle: 'Find current papers and guidelines on a question',
          prompt: 'I am a health researcher. Ask for my research question, then find and summarise the most relevant recent papers and guidelines (PubMed, WHO, CDC, Cochrane): design, population, key findings, limitations — fully cited.',
        },
        {
          icon: 'scale-balance',
          title: 'Critical appraisal',
          subtitle: 'Appraise a study with CASP-style structure',
          prompt: 'I will describe or paste a study. Critically appraise it: validity of the design, risk of bias, statistical soundness, applicability, and overall strength of evidence — structured like a CASP checklist.',
        },
        {
          icon: 'text-box-multiple-outline',
          title: 'Synthesis & gaps',
          subtitle: 'Synthesise findings across studies, identify the gap',
          prompt: 'Ask for my topic, then synthesise what the current literature agrees on, where it conflicts, and the clear research gaps a new study could fill — with citations for every claim.',
        },
        {
          icon: 'school-outline',
          title: 'Grant & proposal help',
          subtitle: 'Structure a compelling research proposal',
          prompt: 'Help me structure a research proposal. Ask for my research question and setting, then outline: background and significance, aims, methods, expected outcomes, and a realistic timeline.',
        },
      ]}
    />
  );
}
