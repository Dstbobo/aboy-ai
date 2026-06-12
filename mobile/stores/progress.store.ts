import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TopicStat {
  topic: string;
  queries: number;        // how many times studied via chat
  correct: number;        // flashcards rated easy
  struggled: number;      // flashcards rated hard
  lastStudied: string;    // ISO date
}

interface ProgressState {
  topics: Record<string, TopicStat>;
  totalQueries: number;
  recordQuery: (text: string) => void;
  recordFlashcard: (topic: string, rating: 'easy' | 'medium' | 'hard') => void;
  strongTopics: () => TopicStat[];
  weakTopics: () => TopicStat[];
  reset: () => void;
}

// Lightweight medical topic extraction — matches known domain keywords in the
// user's question so progress builds automatically as they use the app.
const TOPIC_KEYWORDS: Record<string, string[]> = {
  Cardiology: ['heart', 'cardiac', 'hypertension', 'blood pressure', 'ecg', 'arrhythmia', 'myocardial', 'angina'],
  Respiratory: ['lung', 'asthma', 'copd', 'pneumonia', 'respiratory', 'oxygen', 'ventilation', 'tuberculosis'],
  Neurology: ['brain', 'stroke', 'seizure', 'epilepsy', 'neuro', 'headache', 'migraine', 'parkinson'],
  Endocrinology: ['diabetes', 'insulin', 'thyroid', 'hormone', 'glucose', 'endocrine'],
  'Infectious Disease': ['infection', 'sepsis', 'antibiotic', 'malaria', 'hiv', 'virus', 'bacteria', 'fever'],
  Gastroenterology: ['liver', 'stomach', 'ulcer', 'gastro', 'bowel', 'hepatitis', 'pancrea'],
  Renal: ['kidney', 'renal', 'dialysis', 'urinary', 'nephro'],
  'Obstetrics & Gynecology': ['pregnan', 'labour', 'labor', 'birth', 'obstetric', 'gynec', 'menstrual', 'antenatal'],
  Pediatrics: ['child', 'pediatric', 'paediatric', 'infant', 'neonat', 'vaccine'],
  Pharmacology: ['drug', 'dose', 'dosage', 'medication', 'pharmac', 'side effect', 'interaction'],
  Hematology: ['blood', 'anemia', 'anaemia', 'clot', 'transfusion', 'sickle'],
  'Mental Health': ['depression', 'anxiety', 'psychiatric', 'mental', 'schizo', 'bipolar'],
  Musculoskeletal: ['bone', 'fracture', 'joint', 'muscle', 'arthritis', 'ortho'],
  Oncology: ['cancer', 'tumor', 'tumour', 'oncolog', 'chemo', 'malignan'],
  'Emergency Medicine': ['emergency', 'trauma', 'resuscitation', 'cpr', 'triage', 'shock'],
};

export function extractTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) hits.push(topic);
  }
  return hits;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      topics: {},
      totalQueries: 0,

      recordQuery: (text) => {
        const found = extractTopics(text);
        set((s) => {
          const topics = { ...s.topics };
          for (const t of found) {
            const cur = topics[t] ?? { topic: t, queries: 0, correct: 0, struggled: 0, lastStudied: '' };
            topics[t] = { ...cur, queries: cur.queries + 1, lastStudied: new Date().toISOString() };
          }
          return { topics, totalQueries: s.totalQueries + 1 };
        });
      },

      recordFlashcard: (topic, rating) => {
        set((s) => {
          const topics = { ...s.topics };
          const cur = topics[topic] ?? { topic, queries: 0, correct: 0, struggled: 0, lastStudied: '' };
          topics[topic] = {
            ...cur,
            correct: cur.correct + (rating === 'easy' ? 1 : 0),
            struggled: cur.struggled + (rating === 'hard' ? 1 : 0),
            lastStudied: new Date().toISOString(),
          };
          return { topics };
        });
      },

      strongTopics: () => {
        return Object.values(get().topics)
          .filter((t) => t.queries + t.correct >= 2 && t.correct >= t.struggled)
          .sort((a, b) => b.correct + b.queries - (a.correct + a.queries))
          .slice(0, 5);
      },

      weakTopics: () => {
        return Object.values(get().topics)
          .filter((t) => t.struggled > 0 && t.struggled >= t.correct)
          .sort((a, b) => b.struggled - a.struggled)
          .slice(0, 5);
      },

      reset: () => set({ topics: {}, totalQueries: 0 }),
    }),
    {
      name: 'aboy-progress',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
