import { useEffect, useState } from 'react';
import { api } from '@/services/api';

interface StreakData {
  current_streak: number;
  longest_streak: number;
  today_count: number;
  active_days: string[];
}

export function useStreak() {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<StreakData>('/api/v1/streak')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
