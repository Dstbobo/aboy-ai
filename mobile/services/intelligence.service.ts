import { api } from './api';

export interface QuickActionCard {
  title: string;
  subtitle?: string;
  prompt: string;
  icon: string;
}

export interface Welcome {
  greeting: string;
  message: string;
  progress: string | null;
  streak: number;
  longest_streak: number;
  celebration: string | null;
  last_topic: string | null;
  cards: QuickActionCard[];
}

export interface IntelligenceProfile {
  role?: string;
  topics_frequent?: { topic: string; count: number }[];
  topics_mastered?: string[];
  topics_struggling?: { topic: string; count: number }[];
  strong_areas?: string[];
  weak_areas?: string[];
  current_streak?: number;
  longest_streak?: number;
  peak_active_hour?: number;
  total_sessions?: number;
  total_queries?: number;
  last_topic?: string | null;
}

export async function getWelcome(): Promise<Welcome> {
  const hour = new Date().getHours();
  const { data } = await api.get<Welcome>('/api/v1/intelligence/welcome', { params: { hour } });
  return data;
}

export async function getIntelligenceProfile(): Promise<IntelligenceProfile> {
  const { data } = await api.get<IntelligenceProfile>('/api/v1/intelligence/profile');
  return data;
}
