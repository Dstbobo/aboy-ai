import { api } from './api';

/**
 * Upload a document (PDF, Word .docx, or text) to the backend, which extracts
 * the text and returns an explanation/summary (optionally answering `prompt`).
 */
export async function analyzeDocument(
  uri: string,
  name: string,
  mime: string,
  prompt?: string,
): Promise<string> {
  const form = new FormData();
  form.append('file', { uri, name: name || 'document', type: mime || 'application/octet-stream' } as any);
  if (prompt) form.append('prompt', prompt);

  const { data } = await api.post<{ text: string }>('/api/v1/document', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90000,
  });
  return data.text ?? '';
}
