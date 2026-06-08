import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useStreak } from '@/hooks/useStreak';
import { COLORS } from '@/constants/theme';

export function StreakWidget() {
  const { data, loading } = useStreak();

  if (loading || !data) return null;

  return (
    <View style={styles.container}>
      <View style={styles.stat}>
        <Text style={styles.value}>🔥 {data.current_streak}</Text>
        <Text style={styles.label}>Day Streak</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.value}>{data.today_count}</Text>
        <Text style={styles.label}>Today</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.value}>{data.longest_streak}</Text>
        <Text style={styles.label}>Best</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    elevation: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  value: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  label: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  divider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 8 },
});
