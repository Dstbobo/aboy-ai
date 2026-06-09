import { api } from './api';
import type { Citation } from '@/stores/chat.store';

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  session_id: string;
  emergency_triggered: boolean;
  model_used: string;
  latency_ms: number;
}

export async function sendQuery(
  query: string,
  sessionId: string | null,
  signal?: AbortSignal,
): Promise<QueryResponse> {
  const { data } = await api.post<QueryResponse>(
    '/api/v1/query',
    { query, session_id: sessionId },
    { signal },
  );
  return data;
}

export async function getHistory(limit = 20): Promise<QueryResponse[]> {
  const { data } = await api.get<QueryResponse[]>('/api/v1/history', {
    params: { limit },
  });
  return data;
}
