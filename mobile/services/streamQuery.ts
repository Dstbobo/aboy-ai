import { fetch as expoFetch } from 'expo/fetch';
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

// Minimal streaming UTF-8 decoder (Hermes/New-Arch safe — no TextDecoder needed).
// Buffers a trailing incomplete multibyte sequence across chunk boundaries.
function makeUtf8Decoder() {
  let tail: number[] = [];
  return (bytes: Uint8Array): string => {
    const buf = tail.length ? [...tail, ...bytes] : Array.from(bytes);
    // Find a safe cut point: don't split a multibyte sequence at the end.
    let cut = buf.length;
    for (let i = buf.length - 1; i >= 0 && i >= buf.length - 4; i--) {
      const b = buf[i];
      if (b < 0x80) { break; }                 // ASCII byte — safe boundary after it
      if (b >= 0xc0) {                          // lead byte
        const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2;
        if (buf.length - i < need) cut = i;     // incomplete — hold it back
        break;
      }
    }
    tail = buf.slice(cut);
    const done = buf.slice(0, cut);
    let out = '';
    let i = 0;
    while (i < done.length) {
      const b = done[i];
      if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
      else if (b >= 0xf0) {
        const cp = ((b & 7) << 18) | ((done[i+1] & 63) << 12) | ((done[i+2] & 63) << 6) | (done[i+3] & 63);
        const a = cp - 0x10000; out += String.fromCharCode(0xd800 + (a >> 10), 0xdc00 + (a & 0x3ff)); i += 4;
      } else if (b >= 0xe0) {
        out += String.fromCharCode(((b & 15) << 12) | ((done[i+1] & 63) << 6) | (done[i+2] & 63)); i += 3;
      } else {
        out += String.fromCharCode(((b & 31) << 6) | (done[i+1] & 63)); i += 2;
      }
    }
    return out;
  };
}

/**
 * Streams /query/stream over Server-Sent Events using expo/fetch, which reads an
 * incremental response body correctly under the New Architecture (RN's
 * XMLHttpRequest incremental responseText does NOT stream on New Arch).
 * Returns an abort function.
 */
export async function streamQuery(
  query: string,
  sessionId: string | null,
  history: { role: 'user' | 'assistant'; content: string }[],
  h: StreamHandlers,
): Promise<() => void> {
  const token = await authToken();
  const controller = new AbortController();
  let buffer = '';

  function process(text: string) {
    buffer += text;
    // SSE events are separated by a blank line.
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? ''; // keep the last partial chunk
    for (const ev of events) {
      const line = ev.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { h.onDone(); continue; }
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

  (async () => {
    try {
      const resp = await expoFetch(`${API_URL}/api/v1/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, session_id: sessionId, history: history?.slice(-10) }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        let data: any = null;
        try { data = safeJson(await resp.text()); } catch {}
        h.onError({ response: { status: resp.status, data } });
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { h.onError(new Error('no stream body')); return; }
      const decode = makeUtf8Decoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length) {
          const chunk = decode(value);
          if (chunk) process(chunk);
        }
      }
      h.onDone();
    } catch (e: any) {
      if (controller.signal.aborted || e?.name === 'AbortError') return;
      h.onError(e);
    }
  })();

  return () => {
    try { controller.abort(); } catch {}
  };
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return { detail: s?.slice(0, 200) }; }
}
