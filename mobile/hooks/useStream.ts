import { useCallback, useRef } from 'react';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export function useStream() {
  const abortRef = useRef<AbortController | null>(null);
  const { startStreaming, appendStream, finaliseStream, setLoading } = useChatStore();
  const token = useAuthStore((s) => s.token);

  const streamQuery = useCallback(
    async (query: string, sessionId: string | null, msgId: string) => {
      abortRef.current = new AbortController();
      startStreaming(msgId);
      setLoading(true);

      try {
        const response = await fetch(`${API_URL}/api/v1/query/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query, session_id: sessionId }),
          signal: abortRef.current.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let citations = [];
        let emergency = false;

        if (!reader) return;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') break;
              try {
                const parsed = JSON.parse(raw);
                if (parsed.type === 'text') appendStream(parsed.content);
                if (parsed.type === 'meta') {
                  citations = parsed.citations ?? [];
                  emergency = parsed.emergency_triggered ?? false;
                }
              } catch {
                // raw text chunk — not JSON
                appendStream(raw);
              }
            }
          }
        }

        finaliseStream(msgId, citations, emergency);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          finaliseStream(msgId, [], false);
        }
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { streamQuery, cancel };
}
