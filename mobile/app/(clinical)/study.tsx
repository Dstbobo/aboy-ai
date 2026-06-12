import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/layout/AppScreen';
import { useProgressStore } from '@/stores/progress.store';
import { useAuthStore } from '@/stores/auth.store';
import { ROLE_LABELS } from '@/constants/roles';
import { useChatStore } from '@/stores/chat.store';
import { COLORS } from '@/constants/theme';

/**
 * Study — learning progress dashboard. Tracks topics automatically as the
 * user chats and reviews flashcards; surfaces strong and weak areas.
 */
export default function StudyScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { topics, totalQueries, strongTopics, weakTopics } = useProgressStore();
  const clearChat = useChatStore((s) => s.clearChat);
  const topicList = Object.values(topics).sort((a, b) => b.queries - a.queries);
  const strong = strongTopics();
  const weak = weakTopics();

  function studyTopic(topic: string) {
    clearChat();
    router.push('/(clinical)/chat');
    // Small delay so the chat screen mounts before we could prefill; the user
    // just types — keeping this simple and predictable.
  }

  return (
    <AppScreen title="Study">
      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{totalQueries}</Text>
            <Text style={styles.summaryLabel}>Questions asked</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{topicList.length}</Text>
            <Text style={styles.summaryLabel}>Topics studied</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{ROLE_LABELS[user?.role ?? ''] ? '✓' : '—'}</Text>
            <Text style={styles.summaryLabel}>{ROLE_LABELS[user?.role ?? ''] ?? 'Role'}</Text>
          </View>
        </View>

        {/* Strong areas */}
        <Text style={styles.sectionTitle}>💪 Strong areas</Text>
        {strong.length === 0 ? (
          <Text style={styles.emptyHint}>Keep studying — strengths show up here as you review.</Text>
        ) : (
          strong.map((t) => (
            <View key={t.topic} style={[styles.topicRow, styles.strongRow]}>
              <Text style={styles.topicName}>{t.topic}</Text>
              <Text style={styles.topicMeta}>{t.queries} studied · {t.correct} mastered</Text>
            </View>
          ))
        )}

        {/* Weak areas */}
        <Text style={styles.sectionTitle}>🎯 Needs work</Text>
        {weak.length === 0 ? (
          <Text style={styles.emptyHint}>No weak areas detected yet. Rate flashcards to find them.</Text>
        ) : (
          weak.map((t) => (
            <TouchableOpacity key={t.topic} style={[styles.topicRow, styles.weakRow]} onPress={() => studyTopic(t.topic)}>
              <Text style={styles.topicName}>{t.topic}</Text>
              <Text style={styles.topicMeta}>{t.struggled} struggled — tap to study</Text>
            </TouchableOpacity>
          ))
        )}

        {/* All topics */}
        <Text style={styles.sectionTitle}>📚 All topics</Text>
        {topicList.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={44} color={COLORS.textSecondary} />
            <Text style={styles.emptyTitle}>Nothing tracked yet</Text>
            <Text style={styles.emptyHint}>
              Ask questions in chat — Aboy AI automatically tracks the topics you study and builds your progress here.
            </Text>
          </View>
        ) : (
          topicList.map((t) => (
            <View key={t.topic} style={styles.topicRow}>
              <Text style={styles.topicName}>{t.topic}</Text>
              <Text style={styles.topicMeta}>
                {t.queries}× · last {t.lastStudied ? new Date(t.lastStudied).toLocaleDateString() : '—'}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  summaryNum: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 18, marginBottom: 8 },
  topicRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  strongRow: { borderColor: '#bfe3d2', backgroundColor: '#f2faf6' },
  weakRow: { borderColor: '#f2cdbc', backgroundColor: '#fdf6f2' },
  topicName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  topicMeta: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3 },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyHint: { fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 20, textAlign: 'center' },
});
