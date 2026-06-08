import { create } from 'zustand';

interface QueuedQuery {
  id: string;
  query: string;
  sessionId: string | null;
  queuedAt: Date;
}

interface OfflineState {
  isOffline: boolean;
  queuedQueries: QueuedQuery[];
  setOffline: (offline: boolean) => void;
  enqueueQuery: (query: string, sessionId: string | null) => void;
  dequeueAll: () => QueuedQuery[];
  clearQueue: () => void;
}

const genId = () => Math.random().toString(36).slice(2);

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOffline: false,
  queuedQueries: [],

  setOffline: (isOffline) => set({ isOffline }),

  enqueueQuery: (query, sessionId) => {
    set((s) => ({
      queuedQueries: [...s.queuedQueries, {
        id: genId(),
        query,
        sessionId,
        queuedAt: new Date(),
      }],
    }));
  },

  dequeueAll: () => {
    const all = get().queuedQueries;
    set({ queuedQueries: [] });
    return all;
  },

  clearQueue: () => set({ queuedQueries: [] }),
}));
