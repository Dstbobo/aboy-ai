import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useOfflineStore } from '@/stores/offline.store';
import { sendQuery } from '@/services/query.service';
import { useChatStore } from '@/stores/chat.store';

export function useOffline() {
  const { isOffline, setOffline, dequeueAll } = useOfflineStore();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const offline = !state.isConnected;
      setOffline(offline);

      if (!offline) {
        const queued = dequeueAll();
        for (const item of queued) {
          try {
            const result = await sendQuery(item.query, item.sessionId);
            useChatStore.getState().addAssistantMessage(
              item.id,
              result.answer,
              result.citations,
              result.emergency_triggered,
            );
          } catch {
            // silently drop — user can retry manually
          }
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return { isOffline };
}
