import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/theme';

export default function VerifyScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>✅</Text>
      <Text style={styles.title}>Email Verified</Text>
      <Text style={styles.body}>Your account is confirmed. Sign in to start using Aboy AI.</Text>
      <Button mode="contained" onPress={() => router.replace('/(auth)/login')} style={styles.btn}>
        Sign In
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: COLORS.background,
  },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.primary, marginBottom: 12 },
  body: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn: { width: '100%', borderRadius: 8 },
});
