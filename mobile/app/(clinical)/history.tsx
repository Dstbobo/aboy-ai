import React, { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { AppScreen } from '@/components/layout/AppScreen';
import { useChatStore } from '@/stores/chat.store';
import { getSessions, getSessionMessages, type HistorySession } from '@/services/history.service';
import { COLORS } from '@/constants/theme';

/**
 * History — all past conversations, loaded from Supabase (durable; survives
 * refresh, logout and reinstall). Tapping one opens it fully and continues it.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const hydrate = useChatStore((s) => s.hydrate);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError('');
    getSessions()
      .then(setSessions)
      .catch(() => setError('Could not load your history. Pull to retry.'))
      .finally(() => setLoading(false));
  }, []);

  // Reload every time the screen comes into focus so new chats appear.
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  async function openSession(s: HistorySession) {
    setOpeningId(s.session_id);
    try {
      const messages = await getSessionMessages(s.session_id);
      hydrate(messages, s.session_id); // load + set session so it continues
      router.push('/(clinical)/chat');
    } catch {
      setError('Could not open that conversation.');
    } finally {
      setOpeningId(null);
    }
  }

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <AppScreen title="History">
      {loading ? (
        <ActivityIndicator style={styles.center} color={COLORS.primary} />
      ) : sessions.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="history" size={48} color={COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyBody}>
            {error || 'Your chats are saved automatically and will appear here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.session_id}
          contentContainerStyle={styles.list}
          onRefresh={load}
          refreshing={false}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openSession(item)} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="message-text-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.meta}>
                  {fmtDate(item.updated_at)} · {Math.ceil(item.message_count)} message{item.message_count === 1 ? '' : 's'}
                </Text>
              </View>
              {openingId === item.session_id ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meta: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
