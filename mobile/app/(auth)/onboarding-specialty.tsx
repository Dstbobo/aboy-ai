import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ROLE_SPECIALTIES, ROLE_LABELS, type UserRole } from '@/constants/roles';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { COLORS } from '@/constants/theme';

export default function OnboardingSpecialtyScreen() {
  const { role } = useLocalSearchParams<{ role: UserRole }>();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const { updateRoleInfo, completeOnboarding } = useAuthStore();
  const router = useRouter();

  const specialties = ROLE_SPECIALTIES[role] ?? [];
  const roleLabel   = ROLE_LABELS[role] ?? role;

  async function handleFinish() {
    if (!selected || !role) return;
    setLoading(true);
    try {
      // Persist to backend
      await api.patch('/api/v1/profile', { role, sub_role: selected });
    } catch {
      // Non-fatal — still proceed to home
    }
    // Update local store, then collect role-specific details (final step)
    await updateRoleInfo(role, selected);
    setLoading(false);
    router.push({ pathname: '/(auth)/onboarding-details', params: { role } });
  }

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.step}>Step 2 of 2</Text>
        <Text style={styles.title}>What is your specific area?</Text>
        <Text style={styles.subtitle}>{roleLabel}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {specialties.map(spec => (
            <TouchableOpacity
              key={spec}
              style={[styles.item, selected === spec && styles.itemSelected]}
              onPress={() => setSelected(spec)}
              activeOpacity={0.75}
            >
              <Text style={[styles.itemText, selected === spec && styles.itemTextSelected]}>
                {spec}
              </Text>
              {selected === spec && (
                <View style={styles.check}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky Continue button */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handleFinish}
          disabled={!selected || loading}
          style={styles.continueBtn}
          contentStyle={styles.continueBtnContent}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size={18} />
          ) : (
            "Let's Go →"
          )}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },

  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 18,
    backgroundColor: COLORS.primary,
  },
  backBtn: { marginBottom: 12 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  step: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 2,
  },

  scroll: { padding: 16 },
  list:   { gap: 8 },

  item: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.secondary,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
    flex: 1,
  },
  itemTextSelected: { color: COLORS.primary, fontWeight: '700' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  checkText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  continueBtn: { borderRadius: 12 },
  continueBtnContent: { paddingVertical: 8 },
});
