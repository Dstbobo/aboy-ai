import React from 'react';
import { PromptHub } from '@/components/shared/PromptHub';
import { useAuthStore } from '@/stores/auth.store';
import { ROLE_LABELS } from '@/constants/roles';

/**
 * My Project — academic research project assistant for students.
 * Every stage of the project, powered by the cited RAG pipeline
 * (PubMed, WHO, CDC, NICE, Cochrane).
 */
export default function ProjectScreen() {
  const user = useAuthStore((s) => s.user);
  const course = ROLE_LABELS[user?.role ?? ''] ?? 'healthcare student';
  const specialty = user?.subRole ? ` specialising in ${user.subRole}` : '';
  const me = `I am a ${course}${specialty}.`;

  return (
    <PromptHub
      title="My Project"
      intro="Your research project, start to finish — every answer cited from PubMed, WHO, CDC and other verified sources."
      actions={[
        {
          icon: 'lightbulb-on-outline',
          title: 'Choose a topic',
          subtitle: 'Get researchable topic ideas matched to your course and level',
          prompt: `${me} Suggest 8 strong, feasible research project topics for my course and level. For each: the research question, why it matters, and what data I would need. Prioritise topics with accessible data for a student project.`,
        },
        {
          icon: 'book-search-outline',
          title: 'Literature review',
          subtitle: 'Find and summarise key papers with proper citations',
          prompt: `${me} Help me build a literature review on my project topic. Ask me for my topic first, then: find the key papers and guidelines (PubMed, WHO, CDC), summarise each study's design and findings, identify the research gap, and give me properly formatted references.`,
        },
        {
          icon: 'sitemap-outline',
          title: 'Methodology',
          subtitle: 'Study design, sampling, sample size, ethics',
          prompt: `${me} Guide my research methodology. Ask for my research question, then recommend: study design with justification, target population and sampling technique, sample size calculation (show the formula and working), data collection tools, and the ethical considerations I must address.`,
        },
        {
          icon: 'chart-bar',
          title: 'Data analysis',
          subtitle: 'Choose the right statistical tests and interpret results',
          prompt: `${me} Help me analyse my project data. Ask what variables I collected, then recommend the correct statistical tests (with why), explain how to run them in SPSS or Excel, and how to interpret and present the results in tables and charts.`,
        },
        {
          icon: 'file-document-edit-outline',
          title: 'Write chapter by chapter',
          subtitle: 'Introduction, literature review, methods, results, discussion',
          prompt: `${me} Coach me through writing my project chapter by chapter. Ask which chapter I'm on, then give me the expected structure, what examiners look for, a strong sample opening paragraph for my topic, and common mistakes to avoid.`,
        },
        {
          icon: 'format-quote-close',
          title: 'References & formatting',
          subtitle: 'Auto-format citations — APA, Vancouver, Harvard',
          prompt: `${me} Help me format my references. Ask which referencing style my school requires (APA, Vancouver, or Harvard), then show me exactly how to cite journals, books, websites and WHO/CDC reports in that style, and convert any references I paste.`,
        },
      ]}
    />
  );
}
