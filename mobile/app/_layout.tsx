import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { lightTheme, darkTheme } from '@/constants/theme';
import { useOffline } from '@/hooks/useOffline';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuthStore();
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    // The root index route ("/") owns the initial redirect. Skip the guard
    // there so it doesn't race with the <Redirect> in app/index.tsx.
    if (segments.length === 0) return;

    const inAuthGroup = segments[0] === '(auth)';
    const currentScreen = segments[1] as string | undefined;
    const onboardingScreens = ['onboarding-role', 'onboarding-specialty', 'onboarding-details'];

    // Legal docs (Privacy/Terms) are public — reachable signed in OR out.
    if (segments[0] === '(legal)') return;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/landing');
    } else if (isAuthenticated && inAuthGroup) {
      if (needsOnboarding) {
        // Only redirect if not already on an onboarding screen
        if (!onboardingScreens.includes(currentScreen ?? '')) {
          router.replace('/(auth)/onboarding-role');
        }
      } else {
        router.replace('/(clinical)/chat');
      }
    }
  }, [isAuthenticated, isLoading, needsOnboarding, segments]);

  return <>{children}</>;
}

function NetworkWatcher() {
  useOffline();
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <PaperProvider theme={theme}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <NetworkWatcher />
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(clinical)" />
              <Stack.Screen name="(admin)" />
              <Stack.Screen name="(legal)" />
            </Stack>
          </AuthGuard>
        </PaperProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
