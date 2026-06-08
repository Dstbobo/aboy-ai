import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';

/**
 * Root entry route ("/" and the app scheme aboyai:///).
 * Without this file expo-router has nothing to match at the root URL,
 * which produces the "Unmatched Route - aboyai:///" crash on open.
 *
 * It waits for auth state to load from secure storage, then redirects:
 *   - not signed in            -> landing
 *   - signed in, needs onboard -> role selection
 *   - signed in, onboarded     -> chat
 */
export default function Index() {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/landing" />;
  }

  if (needsOnboarding) {
    return <Redirect href="/(auth)/onboarding-role" />;
  }

  return <Redirect href="/(clinical)/chat" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
