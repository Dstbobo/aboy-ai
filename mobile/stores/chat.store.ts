import { create } from 'zustand';

export interface Citation {
  source_id: string;
  source_name: string;
  section_title: string | null;
  url: string | null;
  evidence_grade: string | null;
  similarity: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  emergency_triggered: boolean;
  timestamp: Date;
  isStreaming?: boolean;
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
  setSession: (sessionId: string) => void;
  setLoading: (loading: boolean) => void;
  clearChat: () => void;
}

const genId = () => Math.random().toString(36).slice(2);

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  streamingContent: '',

  addUserMessage: (content) => {
    const id = genId();
    set((s) => ({
      messages: [...s.messages, {
        id,
        role: 'user',
        content,
        citations: [],
        emergency_triggered: false,
        timestamp: new Date(),
      }],
    }));
    return id;
  },

  addAssistantMessage: (id, content, citations, emergency) => {
    set((s) => ({
      messages: [...s.messages, {
        id,
        role: 'assistant',
        content,
        citations,
        emergency_triggered: emergency,
        timestamp: new Date(),
      }],
      isLoading: false,
    }));
  },

  startStreaming: (id) => {
    set((s) => ({
      streamingContent: '',
      messages: [...s.messages, {
        id,
        role: 'assistant',
        content: '',
        citations: [],
        emergency_triggered: false,
        timestamp: new Date(),
        isStreaming: true,
      }],
    }));
  },

  appendStream: (chunk) => {
    set((s) => {
      const updated = s.messages.map((m) =>
        m.isStreaming ? { ...m, content: m.content + chunk } : m,
      );
      return { messages: updated, streamingContent: s.streamingContent + chunk };
    });
  },

  finaliseStream: (id, citations, emergency) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? { ...m, citations, emergency_triggered: emergency, isStreaming: false }
          : m,
      ),
      isLoading: false,
      streamingContent: '',
    }));
  },

  setSession: (sessionId) => set({ sessionId }),
  setLoading: (isLoading) => set({ isLoading }),
  clearChat: () => set({ messages: [], sessionId: null, streamingContent: '' }),
}));
