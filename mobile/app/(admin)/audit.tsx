import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, Card, Chip, ActivityIndicator } from 'react-native-paper';
import { api } from '@/services/api';
import { AppScreen } from '@/components/layout/AppScreen';
import { COLORS } from '@/constants/theme';

interface AuditEntry {
  id: string;
  user_id: string;
  user_role: string;
  query_raw: string;
  model_used: string;
  latency_ms: number;
  tokens_input: number;
  tokens_output: number;
  emergency_triggered: boolean;
  flagged_for_review: boolean;
  created_at: string;
}

export default function AuditScreen() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<AuditEntry[]>('/api/v1/admin/audit', { params: { limit: 50 } })
      .then((r) => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppScreen title="Audit Log">
        <ActivityIndicator style={styles.center} color={COLORS.primary} />
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Audit Log">
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.row}>
              <Chip compact style={styles.roleChip} textStyle={styles.roleText}>
                {item.user_role}
              </Chip>
              <Text style={styles.time}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            <Text style={styles.query} numberOfLines={2}>{item.query_raw}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{item.latency_ms}ms</Text>
              <Text style={styles.meta}>↑{item.tokens_input} ↓{item.tokens_output} tokens</Text>
              {item.emergency_triggered && (
                <Chip compact style={styles.emergencyChip} textStyle={styles.emergencyText}>
                  Emergency
                </Chip>
              )}
              {item.flagged_for_review && (
                <Chip compact style={styles.flagChip} textStyle={styles.flagText}>
                  Flagged
                </Chip>
              )}
            </View>
          </Card.Content>
        </Card>
      )}
    />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: COLORS.surface },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  roleChip: { backgroundColor: COLORS.secondary },
  roleText: { color: COLORS.primary, fontSize: 11 },
  time: { fontSize: 11, color: COLORS.textSecondary },
  query: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  meta: { fontSize: 11, color: COLORS.textSecondary },
  emergencyChip: { backgroundColor: COLORS.emergencyLight },
  emergencyText: { color: COLORS.emergency, fontSize: 10 },
  flagChip: { backgroundColor: '#fff3e0' },
  flagText: { color: COLORS.warning, fontSize: 10 },
});
