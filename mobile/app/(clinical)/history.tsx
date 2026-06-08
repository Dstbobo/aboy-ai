import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, Card, Chip } from 'react-native-paper';
import { useChatStore } from '@/stores/chat.store';
import { AppScreen } from '@/components/layout/AppScreen';
import { COLORS } from '@/constants/theme';

export default function HistoryScreen() {
  const messages = useChatStore((s) => s.messages.filter((m) => m.role === 'user'));

  return (
    <AppScreen title="History">
      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptyBody}>Your queries will appear here after your first chat.</Text>
        </View>
      ) : (
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card style={styles.card} mode="outlined">
              <Card.Content>
                <Text style={styles.query} numberOfLines={3}>{item.content}</Text>
                <Text style={styles.time}>
                  {item.timestamp.toLocaleDateString()} {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                {item.emergency_triggered && (
                  <Chip compact icon="alert" style={styles.emergencyChip} textStyle={styles.emergencyText}>
                    Emergency flagged
                  </Chip>
                )}
              </Card.Content>
            </Card>
          )}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: COLORS.surface },
  query: { fontSize: 15, color: COLORS.text, lineHeight: 22, marginBottom: 6 },
  time: { fontSize: 12, color: COLORS.textSecondary },
  emergencyChip: { marginTop: 8, backgroundColor: COLORS.emergencyLight, alignSelf: 'flex-start' },
  emergencyText: { color: COLORS.emergency, fontSize: 11 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
});
