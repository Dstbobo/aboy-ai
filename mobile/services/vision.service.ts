import { api } from './api';

export interface VisionResponse {
  text: string;
}

/**
 * Upload an image (textbook page, notes, wound, diagram) to the backend,
 * which runs Gemini vision and returns an explanation.
 */
export async function analyzeImage(uri: string, prompt?: string): Promise<string> {
  const form = new FormData();
  form.append('file', { uri, name: 'image.jpg', type: 'image/jpeg' } as any);
  if (prompt) form.append('prompt', prompt);

  const { data } = await api.post<VisionResponse>('/api/v1/vision', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data.text ?? '';
}
