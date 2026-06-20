import * as SecureStore from 'expo-secure-store';
import { supabase } from './auth.service';
import type { Citation, MedicalImage } from '@/stores/chat.store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface StreamHandlers {
  onStart?: (sessionId: string, tier: number) => void;
  onStatus?: (stage: string, label: string) => void;
  onToken: (text: string) => void;
  onMeta?: (citations: Citation[], emergency: boolean, sessionId: string, auditId?: string) => void;
  onImage?: (image: MedicalImage) => void;
  onImages?: (images: MedicalImage[]) => void;
  onDone: () => void;
  onError: (e: any) => void;
}

async function authToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (session?.access_token) {
      // Silently refresh if the token is expired or within 60s of expiring,
      // so a stream opened after inactivity never starts with a stale token.
      const expSoon = !session.expires_at || session.expires_at * 1000 - Date.now() < 60_000;
      if (expSoon) {
        try {
          const { data: r } = await supabase.auth.refreshSession();
          if (r.session?.access_token) return r.session.access_token;
        } catch {}
      }
      return session.access_token;
    }
  } catch {}
  return SecureStore.getItemAsync('aboy_auth_token');
}

/**
 * Streams /query/stream over Server-Sent Events using XMLHttpRequest, which is
 * the reliable way to read an incremental response body in React Native.
 * Returns an abort function.
 */
export async function streamQuery(
  query: string,
  sessionId: string | null,
  history: { role: 'user' | 'assistant'; content: string }[],
  h: StreamHandlers,
): Promise<() => void> {
  const token = await authToken();
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API_URL}/api/v1/query/stream`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

  let seen = 0;        // chars of responseText already processed
  let buffer = '';     // partial SSE event buffer

  function process(text: string) {
    buffer += text;
    // SSE events are separated by a blank line.
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? ''; // keep the last partial chunk
    for (const ev of events) {
      const line = ev.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        h.onDone();
        continue;
      }
      try {
        const msg = JSON.parse(payload);
        if (msg.type === 'start') h.onStart?.(msg.session_id, msg.tier);
        else if (msg.type === 'status') h.onStatus?.(msg.stage, msg.label);
        else if (msg.type === 'text') h.onToken(msg.content);
        else if (msg.type === 'image') h.onImage?.(msg.image as MedicalImage);
        else if (msg.type === 'images') h.onImages?.((msg.images ?? []) as MedicalImage[]);
        else if (msg.type === 'meta') h.onMeta?.(msg.citations ?? [], !!msg.emergency_triggered, msg.session_id, msg.audit_id);
      } catch {
        // ignore malformed partial
      }
    }
  }

  xhr.onreadystatechange = () => {
    if (xhr.readyState >= 3) {
      const full = xhr.responseText || '';
      if (full.length > seen) {
        const fresh = full.slice(seen);
        seen = full.length;
        process(fresh);
      }
    }
    if (xhr.readyState === 4) {
      if (xhr.status >= 400) h.onError({ response: { status: xhr.status, data: safeJson(xhr.responseText) } });
      else h.onDone();
    }
  };
  xhr.onerror = () => h.onError(new Error('network'));
  xhr.ontimeout = () => h.onError({ code: 'ECONNABORTED' });
  xhr.timeout = 120000;

  xhr.send(JSON.stringify({ query, session_id: sessionId, history: history?.slice(-10) }));

  return () => {
    try { xhr.abort(); } catch {}
  };
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return { detail: s?.slice(0, 200) }; }
}
