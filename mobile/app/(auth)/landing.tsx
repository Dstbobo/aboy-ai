import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AboyLogo } from '@/components/brand/AboyLogo';
import { signInWithGoogle, AuthCancelled, getLastAuthMethod } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

// Cycling hero phrases + on-brand dark-green background shades.
const PHRASES = [
  'Your evidence-based learning assistant',
  'Cited answers you can actually trust',
  'Study smarter — medicine, nursing & beyond',
  'Real sources. No made-up references.',
];
const BG = ['#0a5f52', '#08463d', '#0c5247', '#063a33'];

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setAuth = useAuthStore((s) => s.setAuth);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastGoogle, setLastGoogle] = useState(false);

  const bg = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    getLastAuthMethod().then((m) => setLastGoogle(m === 'google'));
  }, []);

  // Cycle the phrase + background every 4.5s with a soft crossfade.
  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setIdx((i) => {
          const next = (i + 1) % PHRASES.length;
          Animated.timing(bg, { toValue: next, duration: 900, useNativeDriver: false }).start();
          return next;
        });
        Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
      });
    }, 4500);
    return () => clearInterval(t);
  }, [bg, fade]);

  const bgColor = bg.interpolate({ inputRange: BG.map((_, i) => i), outputRange: BG });

  async function handleGoogle() {
    setErr(null);
    setBusy(true);
    try {
      const { user, token, onboarded } = await signInWithGoogle();
      await setAuth(
        { id: user.id, email: user.email, role: user.role as UserRole, fullName: user.fullName },
        token,
      );
      if (onboarded) {
        await completeOnboarding();
        router.replace('/(clinical)/chat');
      } else {
        router.replace('/(auth)/onboarding-role');
      }
    } catch (e) {
      if (!(e instanceof AuthCancelled)) {
        setErr('Google sign-in didn’t complete. Try again, or use email below.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Animated.View style={[styles.root, { backgroundColor: bgColor }]}>
      <StatusBar barStyle="light-content" />

      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top + 60 }]}>
        <AboyLogo size={76} />
        <Text style={styles.brand}>Aboy AI</Text>
        <Animated.Text style={[styles.phrase, { opacity: fade }]}>{PHRASES[idx]}</Animated.Text>
      </View>

      {/* Bottom auth sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        {lastGoogle && (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>You used Google last time</Text>
            <View style={styles.calloutTail} />
          </View>
        )}

        <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} disabled={busy} activeOpacity={0.85}>
          {busy ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <>
              <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {!!err && <Text style={styles.err}>{err}</Text>}

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>

        <TouchableOpacity style={styles.emailBtn} onPress={() => router.push('/(auth)/login')} activeOpacity={0.8}>
          <Text style={styles.emailText}>Log in or sign up with email</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          For educational use only. Always consult a licensed clinician.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  brand: { color: '#ffffff', fontSize: 30, fontWeight: '800', marginTop: 16 },
  phrase: {
    color: 'rgba(255,255,255,0.92)', fontSize: 19, fontWeight: '600',
    textAlign: 'center', marginTop: 18, lineHeight: 27, minHeight: 56,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 26,
  },
  callout: {
    alignSelf: 'center', backgroundColor: COLORS.secondary,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, marginBottom: 12,
  },
  calloutText: { color: COLORS.primaryDark, fontSize: 12.5, fontWeight: '700' },
  calloutTail: {
    position: 'absolute', bottom: -5, left: '50%', marginLeft: -5,
    width: 10, height: 10, backgroundColor: COLORS.secondary, transform: [{ rotate: '45deg' }],
  },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 54, borderRadius: 27, backgroundColor: '#ffffff',
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  googleText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  err: { color: COLORS.error, fontSize: 13, textAlign: 'center', marginTop: 10 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textSecondary, fontSize: 13 },
  emailBtn: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  emailText: { color: '#ffffff', fontSize: 15.5, fontWeight: '700' },
  disclaimer: { color: COLORS.textSecondary, fontSize: 11.5, textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
