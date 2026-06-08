import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { STUDENT_ROLES, PROFESSIONAL_ROLES, type UserRole, type RoleOption } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

export default function OnboardingRoleScreen() {
  const [selected, setSelected] = useState<UserRole | null>(null);
  const router = useRouter();

  function handleContinue() {
    if (!selected) return;
    router.push({ pathname: '/(auth)/onboarding-specialty', params: { role: selected } });
  }

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.step}>Step 1 of 2</Text>
        <Text style={styles.title}>What best describes you?</Text>
        <Text style={styles.subtitle}>
          We'll personalise every answer to your exact role and knowledge level.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Students section */}
        <Text style={styles.sectionLabel}>STUDENTS</Text>
        <View style={styles.grid}>
          {STUDENT_ROLES.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              selected={selected === role.id}
              onPress={() => setSelected(role.id)}
            />
          ))}
        </View>

        {/* Professionals section */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>PROFESSIONALS</Text>
        <View style={styles.grid}>
          {PROFESSIONAL_ROLES.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              selected={selected === role.id}
              onPress={() => setSelected(role.id)}
            />
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky Continue button */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handleContinue}
          disabled={!selected}
          style={styles.continueBtn}
          contentStyle={styles.continueBtnContent}
        >
          Continue →
        </Button>
      </View>
    </View>
  );
}

function RoleCard({
  role,
  selected,
  onPress,
}: {
  role: RoleOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.cardIcon}>{role.icon}</Text>
      <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]} numberOfLines={2}>
        {role.label}
      </Text>
      {selected && <View style={styles.checkBadge}><Text style={styles.checkText}>✓</Text></View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },

  header: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: COLORS.primary,
  },
  step: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
  },

  scroll: { padding: 16 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    marginBottom: 10,
    marginTop: 4,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  card: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'flex-start',
    minHeight: 90,
    justifyContent: 'center',
    position: 'relative',
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.secondary,
  },
  cardIcon: { fontSize: 24, marginBottom: 6 },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 17,
  },
  cardLabelSelected: { color: COLORS.primary },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: '#fff', fontSize: 11, fontWeight: '800' },

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
