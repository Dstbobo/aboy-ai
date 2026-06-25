/**
 * Register screen — no email verification.
 * Supabase: disable "Confirm email" in Authentication → Settings → Email Auth.
 * After signup, immediately signs in and navigates to role onboarding.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { COLORS } from '@/constants/theme';
import { AboyLogo } from '@/components/brand/AboyLogo';
import type { UserRole } from '@/constants/roles';

export default function RegisterScreen() {
  const [fullName, setFullName]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirm]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const { setAuth } = useAuthStore();
  const router = useRouter();

  async function handleRegister() {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Step 1 — Sign up
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (signUpError) throw signUpError;

      // Step 2 — Sign in immediately (email confirmation must be disabled in Supabase dashboard)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        if (signInError.message.toLowerCase().includes('email not confirmed')) {
          setError(
            'Email confirmation is still enabled in your Supabase project.\n\n' +
            'Go to: Supabase Dashboard → Authentication → Settings → Email Auth → ' +
            'disable "Confirm email" and try again.'
          );
          setLoading(false);
          return;
        }
        throw signInError;
      }

      const role = (data.user?.app_metadata?.role ?? 'student_med') as UserRole;
      await setAuth(
        {
          id: data.user!.id,
          email: data.user!.email!,
          role,
          fullName: fullName.trim(),
        },
        data.session!.access_token,
      );

      // Step 3 — Go to role selection onboarding (skip email verification entirely)
      router.replace('/(auth)/onboarding-role');
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <AboyLogo size={64} />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Free for students & healthcare workers</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            mode="outlined"
            style={styles.input}
            autoCapitalize="words"
            autoComplete="name"
          />
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            mode="outlined"
            style={styles.input}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(v => !v)}
              />
            }
          />
          <TextInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirm}
            secureTextEntry
            mode="outlined"
            style={styles.input}
          />
          {!!error && <HelperText type="error" style={styles.errorText}>{error}</HelperText>}

          <Button
            mode="contained"
            onPress={handleRegister}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Create Account
          </Button>

          <Button mode="text" onPress={() => router.back()} style={styles.link}>
            Already have an account? Sign In
          </Button>

          <Text style={styles.consent}>
            By creating an account you agree to our{' '}
            <Text style={styles.consentLink} onPress={() => router.push('/(legal)/terms')}>Terms</Text>
            {' '}and{' '}
            <Text style={styles.consentLink} onPress={() => router.push('/(legal)/privacy')}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:          { flex: 1, backgroundColor: COLORS.background },
  container:     { flexGrow: 1, padding: 24, paddingTop: 60 },
  header:        { alignItems: 'center', marginBottom: 32 },
  logo:          { fontSize: 48, marginBottom: 8 },
  title:         { fontSize: 26, fontWeight: '800', color: COLORS.primary },
  subtitle:      { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  form:          { gap: 4 },
  input:         { marginBottom: 8 },
  rowTwo:        { flexDirection: 'row', gap: 10 },
  rowItem:       { flex: 1 },
  rowItemSmall:  { width: 110 },
  errorText:     { lineHeight: 18 },
  button:        { marginTop: 12, borderRadius: 8 },
  buttonContent: { paddingVertical: 6 },
  link:          { marginTop: 8 },
  consent:       { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  consentLink:   { color: COLORS.primary, fontWeight: '600' },
});
