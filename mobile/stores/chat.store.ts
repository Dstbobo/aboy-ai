import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Citation {
  source_id: string;
  source_name: string;
  section_title: string | null;
  url: string | null;
  evidence_grade: string | null;
  similarity: number;
}

export interface MedicalImage {
  url: string;
  title: string;
  source: string;
  page_url?: string;
  license?: string;
  attribution?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  emergency_triggered: boolean;
  timestamp: Date;
  isStreaming?: boolean;
  image?: MedicalImage | null;
}

export interface LoadedMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

interface ChatState {
  messages: Message[];
  sessionId: string | null;
  isLoading: boolean;
  streamingContent: string;
  addUserMessage: (content: string) => string;
  addAssistantMessage: (id: string, content: string, citations: Citation[], emergency: boolean) => void;
  startStreaming: (id: string) => void;
  appendStream: (chunk: string) => void;
  finaliseStream: (id: string, citations: Citation[], emergency: boolean) => void;
  setMessageImage: (id: string, image: MedicalImage) => void;
  setSession: (sessionId: string) => void;
  setLoading: (loading: boolean) => void;
  /** Replace the conversation with one loaded from Supabase history. */
  hydrate: (messages: LoadedMessage[], sessionId: string) => void;
  clearChat: () => void;
}

const genId = () => Math.random().toString(36).slice(2);

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      sessionId: null,
      isLoading: false,
      streamingContent: '',

      addUserMessage: (content) => {
        const id = genId();
        set((s) => ({
          messages: [...s.messages, {
            id, role: 'user', content, citations: [], emergency_triggered: false, timestamp: new Date(),
          }],
        }));
        return id;
      },

      addAssistantMessage: (id, content, citations, emergency) => {
        set((s) => ({
          messages: [...s.messages, {
            id, role: 'assistant', content, citations, emergency_triggered: emergency, timestamp: new Date(),
          }],
          isLoading: false,
        }));
      },

      startStreaming: (id) => {
        set((s) => ({
          streamingContent: '',
          messages: [...s.messages, {
            id, role: 'assistant', content: '', citations: [], emergency_triggered: false,
            timestamp: new Date(), isStreaming: true,
          }],
        }));
      },

      appendStream: (chunk) => {
        set((s) => {
          const updated = s.messages.map((m) => (m.isStreaming ? { ...m, content: m.content + chunk } : m));
          return { messages: updated, streamingContent: s.streamingContent + chunk };
        });
      },

      finaliseStream: (id, citations, emergency) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, citations, emergency_triggered: emergency, isStreaming: false } : m,
          ),
          isLoading: false,
          streamingContent: '',
        }));
      },

      setMessageImage: (id, image) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            // Attach to the target id, or fall back to the live streaming message.
            m.id === id || m.isStreaming ? { ...m, image } : m,
          ),
        }));
      },

      setSession: (sessionId) => set({ sessionId }),
      setLoading: (isLoading) => set({ isLoading }),

      hydrate: (loaded, sessionId) =>
        set({
          sessionId,
          messages: loaded.map((m) => ({
            id: genId(),
            role: m.role,
            content: m.content,
            citations: m.citations ?? [],
            emergency_triggered: false,
            timestamp: new Date(),
          })),
          streamingContent: '',
          isLoading: false,
        }),

      clearChat: () => set({ messages: [], sessionId: null, streamingContent: '' }),
    }),
    {
      name: 'aboy-chat',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the conversation itself (not transient loading flags).
      partialize: (s) => ({ messages: s.messages, sessionId: s.sessionId }),
      // App was fully closed and reopened → ALWAYS start a fresh chat. The
      // previous conversation is already saved to History (server-side), so
      // nothing is lost. We never restore the old conversation on cold start.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.messages = [];
        state.sessionId = null;
        state.streamingContent = '';
      },
    },
  ),
);
