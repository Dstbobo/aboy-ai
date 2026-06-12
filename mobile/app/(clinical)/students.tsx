import React from 'react';
import { PromptHub } from '@/components/shared/PromptHub';

/** My Students — teaching tools for educators. */
export default function StudentsScreen() {
  return (
    <PromptHub
      title="My Students"
      intro="Build teaching materials and assessments in minutes — all evidence-based."
      actions={[
        {
          icon: 'clipboard-edit-outline',
          title: 'Lesson plan',
          subtitle: 'Objectives, activities and assessment for a topic',
          prompt: 'I am a healthcare educator. Ask what topic and level I am teaching, then produce a complete lesson plan: learning objectives (Bloom-aligned), teaching activities, time allocation, and assessment methods.',
        },
        {
          icon: 'help-box-multiple-outline',
          title: 'Exam questions',
          subtitle: 'MCQs, SAQs and OSCE stations with answer keys',
          prompt: 'Ask me for the topic and level, then generate exam questions: 10 single-best-answer MCQs with explanations, 3 short-answer questions with model answers, and 1 OSCE station with a marking rubric.',
        },
        {
          icon: 'presentation',
          title: 'Teaching outline',
          subtitle: 'Slide-by-slide lecture outline with key evidence',
          prompt: 'Ask me for my lecture topic and duration, then create a slide-by-slide outline: titles, key points per slide, clinical examples, and the cited guidelines or papers to reference.',
        },
        {
          icon: 'account-check-outline',
          title: 'Student feedback',
          subtitle: 'Constructive feedback drafts for assessments',
          prompt: 'Help me write constructive student feedback. Ask what the student did well and where they struggled, then draft specific, actionable, encouraging feedback using the Pendleton model.',
        },
      ]}
    />
  );
}
