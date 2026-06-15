import { api } from './api';

export interface Usage {
  used: number;
  limit: number;
  remaining: number;
  mode: string;
  resets_at: string;
}

export async function getUsage(): Promise<Usage> {
  const { data } = await api.get<Usage>('/api/v1/usage');
  return data;
}

export async function rateAnswer(
  opts: { auditId?: string | null; sessionId?: string | null; comment?: string },
  rating: 'up' | 'down',
): Promise<void> {
  await api.post('/api/v1/feedback/rate', {
    rating,
    audit_id: opts.auditId ?? undefined,
    session_id: opts.sessionId ?? undefined,
    comment: opts.comment ?? undefined,
  });
}

// Fire-and-forget activation-funnel event (server allow-lists step names).
export function recordEvent(step: string): void {
  api.post('/api/v1/events', { step }).catch(() => {});
}
