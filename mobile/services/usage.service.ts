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

export async function rateAnswer(sessionId: string, rating: 'up' | 'down'): Promise<void> {
  await api.post('/api/v1/feedback/rate', { session_id: sessionId, rating });
}
