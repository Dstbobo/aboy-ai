import { api } from './api';
import type { LoadedMessage } from '@/stores/chat.store';

export interface HistorySession {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export async function getSessions(): Promise<HistorySession[]> {
  const { data } = await api.get<HistorySession[]>('/api/v1/history/sessions');
  return data;
}

export async function getSessionMessages(sessionId: string): Promise<LoadedMessage[]> {
  const { data } = await api.get<{ messages: LoadedMessage[] }>(
    `/api/v1/history/sessions/${sessionId}`,
  );
  return data.messages ?? [];
}
