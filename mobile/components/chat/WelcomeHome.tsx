import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getWelcome, type Welcome } from '@/services/intelligence.service';
import { recordEvent } from '@/services/usage.service';
import { scheduleStreakNudges } from '@/services/nudges';
import { COLORS } from '@/constants/theme';

/**
 * Clean welcome-back home shown before a fresh chat: just a personalised
 * greeting, nothing else. The streak/quiz/study cards were intentionally removed
 * to keep the start screen uncluttered:
 *   - the streak lives in the morning notification (scheduleStreakNudges),
 *   - quiz lives in the menu (next to Flashcards),
 *   - weakness/struggle/where-you-left-off live in the Study section.
 * The `onPick` prop is kept for compatibility (the home no longer shows cards).
 */
export function WelcomeHome(_props: { onPick: (prompt: string) => void }) {
  const [w, setW] = useState<Welcome | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    recordEvent('welcome_shown');
    getWelcome()
      .then((res) => {
        if (!alive) return;
        setW(res);
        // Streak stays alive via a quiet local notification — not on the screen.
        scheduleStreakNudges(res.streak).catch(() => {});
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.top}>
      <Text style={styles.greeting}>{w?.greeting ?? 'Hello'}</Text>
      {!!w?.message && <Text style={styles.message}>{w.message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  // Greeting sits around the middle, lifted slightly (paddingBottom) so the
  // keyboard never reaches it but it isn't pinned to the top either.
  top: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 190, paddingHorizontal: 32 },
  greeting: { fontSize: 26, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  message: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 22 },
});
