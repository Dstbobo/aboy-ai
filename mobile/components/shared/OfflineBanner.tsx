import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useOfflineStore } from '@/stores/offline.store';
import { COLORS } from '@/constants/theme';

export function OfflineBanner() {
  const isOffline = useOfflineStore((s) => s.isOffline);
  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You're offline — queries will send when reconnected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.warning,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
