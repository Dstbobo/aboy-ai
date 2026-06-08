import React from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { COLORS } from '@/constants/theme';

export function EmergencyBanner() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚠️ Emergency Resources</Text>
      <Text style={styles.body}>
        If this is a medical emergency, please contact emergency services immediately.
      </Text>
      <View style={styles.row}>
        <Button
          mode="contained"
          buttonColor={COLORS.error}
          onPress={() => Linking.openURL('tel:911')}
          style={styles.btn}
        >
          Call 911
        </Button>
        <Button
          mode="outlined"
          textColor={COLORS.error}
          onPress={() => Linking.openURL('https://www.who.int/emergencies')}
          style={styles.btn}
        >
          WHO Resources
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.emergencyLight,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.emergency,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  title: {
    fontWeight: '700',
    color: COLORS.emergency,
    fontSize: 15,
    marginBottom: 4,
  },
  body: {
    color: COLORS.text,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1 },
});
