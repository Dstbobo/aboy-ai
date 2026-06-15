import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { recordEvent } from '@/services/usage.service';
import { useAuthStore } from '@/stores/auth.store';
import { ROLE_LABELS, type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  numeric?: boolean;
}

/** Role-category-specific signup fields. */
function fieldsForRole(role: UserRole): FieldDef[] {
  if (role.startsWith('student_')) {
    return [
      { key: 'year_of_study', label: 'Year of study', placeholder: 'e.g. 3', numeric: true },
      { key: 'course', label: 'Course / Programme', placeholder: 'e.g. MBBS, BNSc' },
      { key: 'institution', label: 'University / Institution' },
      { key: 'country', label: 'Country' },
    ];
  }
  if (role.startsWith('pro_')) {
    return [
      { key: 'institution', label: 'Hospital or Clinic name' },
      { key: 'department', label: 'Department', placeholder: 'e.g. Emergency, Pharmacy' },
      { key: 'years_experience', label: 'Years of experience', numeric: true },
      { key: 'country', label: 'Country' },
    ];
  }
  if (role.startsWith('ops_')) {
    return [
      { key: 'institution', label: 'Hospital or Facility name' },
      { key: 'job_title', label: 'Job title' },
      { key: 'country', label: 'Country' },
    ];
  }
  if (role.startsWith('edu_') || role === 'educator') {
    return [
      { key: 'institution', label: 'Institution' },
      { key: 'department', label: 'Department' },
      { key: 'country', label: 'Country' },
    ];
  }
  if (role.startsWith('res_')) {
    return [
      { key: 'institution', label: 'Organisation' },
      { key: 'research_area', label: 'Research area' },
      { key: 'country', label: 'Country' },
    ];
  }
  return [
    { key: 'institution', label: 'Institution' },
    { key: 'country', label: 'Country' },
  ];
}

export default function OnboardingDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role: UserRole }>();
  const { completeOnboarding } = useAuthStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const roleId = (role ?? 'student_med') as UserRole;
  const fields = fieldsForRole(roleId);

  async function handleFinish() {
    setSaving(true);
    const details: Record<string, string | number> = {};
    for (const f of fields) {
      const v = (values[f.key] ?? '').trim();
      if (!v) continue;
      details[f.key] = f.numeric ? parseInt(v, 10) || v : v;
    }
    try {
      await api.patch('/api/v1/profile', {
        institution: (values.institution ?? '').trim() || undefined,
        country_code: (values.country ?? '').trim() || undefined,
        graduation_year:
          values.year_of_study && Number.isFinite(parseInt(values.year_of_study, 10))
            ? parseInt(values.year_of_study, 10)
            : undefined,
        details,
      });
    } catch {
      // non-fatal — editable later in Settings
    }
    recordEvent('onboarding_complete');
    await completeOnboarding();
    setSaving(false);
    router.replace('/(clinical)/chat');
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.step}>Final step</Text>
        <Text style={styles.title}>About you</Text>
        <Text style={styles.subtitle}>
          As a {ROLE_LABELS[roleId] ?? 'healthcare user'}, this helps Aboy AI tailor every answer.
        </Text>

        <View style={styles.form}>
          {fields.map((f) => (
            <TextInput
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={values[f.key] ?? ''}
              onChangeText={(t) =>
                setValues((v) => ({ ...v, [f.key]: f.numeric ? t.replace(/[^0-9]/g, '') : t }))
              }
              keyboardType={f.numeric ? 'number-pad' : 'default'}
              mode="outlined"
              style={styles.input}
              autoCapitalize="words"
            />
          ))}
        </View>

        <Button
          mode="contained"
          onPress={handleFinish}
          loading={saving}
          disabled={saving}
          style={styles.button}
          contentStyle={{ paddingVertical: 6 }}
        >
          Finish
        </Button>
        <Button mode="text" onPress={handleFinish} disabled={saving}>
          Skip for now
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, padding: 24 },
  step: { fontSize: 13, color: COLORS.primary, fontWeight: '700', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20, marginBottom: 20 },
  form: { gap: 4 },
  input: { marginBottom: 8 },
  button: { marginTop: 14, borderRadius: 10, marginBottom: 4 },
});
