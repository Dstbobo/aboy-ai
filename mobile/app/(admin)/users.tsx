import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, Card, Chip, ActivityIndicator } from 'react-native-paper';
import { api } from '@/services/api';
import { COLORS } from '@/constants/theme';
import { ROLE_LABELS, type UserRole } from '@/constants/roles';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  role_verified: boolean;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
}

export default function UsersScreen() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<UserProfile[]>('/api/v1/admin/users')
      .then((r) => setUsers(r.data))
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={styles.center} color={COLORS.primary} />;
  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;

  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.row}>
              <Text style={styles.name}>{item.full_name ?? item.email}</Text>
              <Chip compact style={item.is_active ? styles.activeChip : styles.inactiveChip}>
                {item.is_active ? 'Active' : 'Inactive'}
              </Chip>
            </View>
            <Text style={styles.email}>{item.email}</Text>
            <View style={styles.metaRow}>
              <Chip compact style={styles.roleChip} textStyle={styles.roleText}>
                {ROLE_LABELS[item.role] ?? item.role}
              </Chip>
              {item.role_verified && (
                <Chip compact style={styles.verifiedChip} textStyle={styles.verifiedText}>
                  Verified
                </Chip>
              )}
            </View>
            {item.last_active_at && (
              <Text style={styles.lastActive}>
                Last active: {new Date(item.last_active_at).toLocaleDateString()}
              </Text>
            )}
          </Card.Content>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: COLORS.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: COLORS.error },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  email: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roleChip: { backgroundColor: COLORS.secondary },
  roleText: { color: COLORS.primary, fontSize: 11 },
  verifiedChip: { backgroundColor: '#e8f5e9' },
  verifiedText: { color: COLORS.success, fontSize: 11 },
  activeChip: { backgroundColor: '#e8f5e9' },
  inactiveChip: { backgroundColor: '#fce4ec' },
  lastActive: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6 },
});
