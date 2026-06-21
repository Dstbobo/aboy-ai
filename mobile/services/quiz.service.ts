import { api } from './api';

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;     // 0-based index of the right option
  explanation: string;
}

export interface Quiz {
  topic: string;
  questions: QuizQuestion[];
}

/** Generate a multiple-choice quiz on a topic (empty topic = mixed high-yield). */
export async function getQuiz(topic: string, count = 5): Promise<Quiz> {
  const { data } = await api.post<Quiz>('/api/v1/quiz', { topic, count }, { timeout: 60000 });
  return data;
}
