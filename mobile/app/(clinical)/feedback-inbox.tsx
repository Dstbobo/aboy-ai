import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppScreen } from '@/components/layout/AppScreen';
import { api } from '@/services/api';
import { COLORS } from '@/constants/theme';

interface FeedbackItem {
  id: number;
  category: string;
  message: string;
  created_at: string;
}

const ICON: Record<string, string> = { bug: '🐞', idea: '💡', general: '💬' };

export default function FeedbackInboxScreen() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'bug' | 'idea' | 'general'>('all');

  const counts = useMemo(() => ({
    all: items.length,
    bug: items.filter((i) => i.category === 'bug').length,
    idea: items.filter((i) => i.category === 'idea').length,
    general: items.filter((i) => i.category === 'general').length,
  }), [items]);
  const visible = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const TABS: { key: typeof filter; label: string }[] = [
    { key: 'all', label: `All ${counts.all}` },
    { key: 'bug', label: `🐞 ${counts.bug}` },
    { key: 'idea', label: `💡 ${counts.idea}` },
    { key: 'general', label: `💬 ${counts.general}` },
  ];

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<FeedbackItem[]>('/api/v1/feedback/app/list');
      setItems(data ?? []);
    } catch {
      setError('Could not load feedback.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <AppScreen title="Feedback">
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <View style={styles.tabs}>
              {TABS.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tab, filter === t.key && styles.tabActive]}
                  onPress={() => setFilter(t.key)}
                >
                  <Text style={[styles.tabText, filter === t.key && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>{error ?? 'No feedback yet'}</Text>
              <Text style={styles.emptyBody}>
                Tester feedback (Settings → Send feedback) will appear here. Pull down to refresh.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cat}>{ICON[item.category] ?? '💬'} {item.category}</Text>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Text style={styles.msg}>{item.message}</Text>
            </View>
          )}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  list: { padding: 16, paddingBottom: 40 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  tabActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primaryDark },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cat: { fontSize: 13, fontWeight: '700', color: COLORS.primaryDark, textTransform: 'capitalize' },
  date: { fontSize: 11.5, color: COLORS.textSecondary },
  msg: { fontSize: 14.5, color: COLORS.text, lineHeight: 21 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 13.5, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
