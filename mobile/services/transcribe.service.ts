import { api } from './api';

export interface TranscribeResponse {
  text: string;
}

function audioMeta(uri: string): { name: string; type: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.wav')) return { name: 'audio.wav', type: 'audio/wav' };
  if (lower.endsWith('.aac')) return { name: 'audio.aac', type: 'audio/aac' };
  if (lower.endsWith('.m4a')) return { name: 'audio.m4a', type: 'audio/aac' };
  return { name: 'audio.aac', type: 'audio/aac' };
}

/**
 * Upload recorded audio to the backend, which runs Gemini transcription
 * and returns the text.
 */
export async function transcribeAudio(uri: string): Promise<string> {
  const { name, type } = audioMeta(uri);
  const form = new FormData();
  form.append('file', { uri, name, type } as any);

  const { data } = await api.post<TranscribeResponse>('/api/v1/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data.text ?? '';
}
