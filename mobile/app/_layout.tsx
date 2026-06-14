import React, { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { AppState, useColorScheme } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { supabase } from '@/services/auth.service';
import { setNudgeName } from '@/services/nudges';
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

/**
 * App lifecycle:
 *  - BUG 3: silently refresh the auth token whenever the app returns to the
 *    foreground after inactivity (Supabase auto-refresh timers are paused in
 *    the background), and keep auto-refresh running while active.
 *  - Start a fresh chat each time the app is reopened after a real gap, so the
 *    intelligent welcome screen shows. Previous turns remain in History.
 */
function AppLifecycle() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (user?.fullName) setNudgeName(user.fullName).catch(() => {});
  }, [user?.fullName]);

  useEffect(() => {
    if (!isAuthenticated) return;
    supabase.auth.startAutoRefresh().catch(() => {});

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh().catch(() => {});
        supabase.auth.refreshSession().catch(() => {}); // proactive silent refresh
        // Fresh chat if we were away for more than 2 minutes and not mid-stream.
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        const chat = useChatStore.getState();
        if (away > 120000 && !chat.isLoading && chat.messages.length > 0) {
          chat.clearChat();
        }
        backgroundedAt.current = null;
      } else if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
        supabase.auth.stopAutoRefresh().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [isAuthenticated]);

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
          <AppLifecycle />
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
