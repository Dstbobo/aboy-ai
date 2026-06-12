import React from 'react';
import { PromptHub } from '@/components/shared/PromptHub';

/** Reports — practical tools for hospital operations staff. */
export default function ReportsScreen() {
  return (
    <PromptHub
      title="Reports"
      intro="Draft professional hospital documents and reports in minutes."
      actions={[
        {
          icon: 'file-document-outline',
          title: 'Incident report',
          subtitle: 'Structured incident report from your description',
          prompt: 'Help me write a professional hospital incident report. Ask me what happened (who, what, when, where), then produce a structured report: summary, sequence of events, immediate actions taken, contributing factors, and recommendations.',
        },
        {
          icon: 'chart-line',
          title: 'Monthly summary',
          subtitle: 'Departmental activity and KPI summaries',
          prompt: 'Help me prepare a monthly departmental report. Ask for my department and the key numbers, then format a clean report: overview, activity statistics, achievements, challenges, and recommendations for next month.',
        },
        {
          icon: 'email-edit-outline',
          title: 'Professional letters',
          subtitle: 'Memos, requests and official correspondence',
          prompt: 'Help me draft a professional hospital memo or letter. Ask who it is to, the purpose, and the key points, then write it in formal, clear language ready to send.',
        },
        {
          icon: 'clipboard-list-outline',
          title: 'SOP drafting',
          subtitle: 'Standard operating procedures for your unit',
          prompt: 'Help me write a standard operating procedure (SOP) for my unit. Ask for the process, then produce: purpose, scope, responsibilities, step-by-step procedure, and safety notes.',
        },
      ]}
    />
  );
}
