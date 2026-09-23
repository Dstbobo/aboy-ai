import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Text,
} from 'react-native';
import { Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ROLE_CATEGORIES,
  ROLE_SPECIALTIES,
  type UserRole,
  type RoleOption,
  type RoleCategory,
} from '@/constants/roles';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { COLORS } from '@/constants/theme';

/**
 * Role selection — five expandable categories, each with its own search.
 * Roles with specialties continue to step 2; the rest finish onboarding here.
 */
export default function OnboardingRoleScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { completeOnboarding } = useAuthStore();

  async function handleContinue() {
    if (!selected) return;
    const hasSpecialties = (ROLE_SPECIALTIES[selected] ?? []).length > 0;
    if (hasSpecialties) {
      router.push({ pathname: '/(auth)/onboarding-specialty', params: { role: selected } });
      return;
    }
    // Roles are server-controlled. Record the selection for admin review, then
    // collect the matching profile details without treating it as authoritative.
    setSaving(true);
    try {
      await api.post('/api/v1/profile/role-change', { to_role: selected });
    } catch {
      // Non-fatal during onboarding; the account retains its server-side role.
    }
    setSaving(false);
    router.push({ pathname: '/(auth)/onboarding-details', params: { role: selected } });
  }

  // Role is optional — skip straight to chat with a sensible default. Users can
  // set their role later in Settings; nothing is ever gated by role.
  async function handleSkip() {
    setSaving(true);
    await completeOnboarding();
    setSaving(false);
    router.replace('/(clinical)/chat');
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top + 18 }]}>
      <View style={styles.header}>
        <Text style={styles.step}>Step 1 of 2</Text>
        <Text style={styles.title}>What best describes you?</Text>
        <Text style={styles.subtitle}>
          Optional — it just tailors the tone of answers. You can change or skip it,
          and nothing is ever locked to your role.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {ROLE_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            expanded={expanded === cat.id}
            selected={selected}
            onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
            onSelect={setSelected}
          />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Button
          mode="contained"
          onPress={handleContinue}
          disabled={!selected || saving}
          loading={saving}
          style={styles.continueBtn}
          contentStyle={{ paddingVertical: 6 }}
        >
          Continue
        </Button>
        <TouchableOpacity onPress={handleSkip} disabled={saving} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CategoryCard({
  category,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  category: RoleCategory;
  expanded: boolean;
  selected: UserRole | null;
  onToggle: () => void;
  onSelect: (r: UserRole) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedInside = category.roles.some((r) => r.id === selected);
  const visible = query.trim()
    ? category.roles.filter((r) => r.label.toLowerCase().includes(query.trim().toLowerCase()))
    : category.roles;

  return (
    <View style={[styles.catCard, (expanded || selectedInside) && styles.catCardActive]}>
      <TouchableOpacity style={styles.catHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.catIconWrap}>
          <MaterialCommunityIcons name={category.icon as any} size={24} color={COLORS.primary} />
        </View>
        <View style={styles.catText}>
          <Text style={styles.catTitle}>{category.label}</Text>
          <Text style={styles.catDesc}>{category.description}</Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.catBody}>
          {/* Per-category search */}
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${category.label.toLowerCase()}…`}
              placeholderTextColor={COLORS.textSecondary}
              value={query}
              onChangeText={setQuery}
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {visible.length === 0 ? (
            <Text style={styles.noMatch}>No roles match “{query}”.</Text>
          ) : (
            visible.map((role: RoleOption) => (
              <TouchableOpacity
                key={role.id}
                style={[styles.roleRow, selected === role.id && styles.roleRowSelected]}
                onPress={() => onSelect(role.id)}
              >
                <Text style={styles.roleIcon}>{role.icon}</Text>
                <Text style={[styles.roleLabel, selected === role.id && styles.roleLabelSelected]}>
                  {role.label}
                </Text>
                {selected === role.id && (
                  <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 22, marginBottom: 12 },
  step: { fontSize: 13, color: COLORS.primary, fontWeight: '700', marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  scroll: { paddingHorizontal: 16, paddingBottom: 16 },
  catCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  catCardActive: { borderColor: COLORS.primary },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  catIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
  },
  catText: { flex: 1 },
  catTitle: { fontSize: 16.5, fontWeight: '700', color: COLORS.text },
  catDesc: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  catBody: { paddingHorizontal: 12, paddingBottom: 12 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14.5, color: COLORS.text },
  noMatch: { fontSize: 13.5, color: COLORS.textSecondary, padding: 12, textAlign: 'center' },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  roleRowSelected: { backgroundColor: COLORS.secondary },
  roleIcon: { fontSize: 20 },
  roleLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  roleLabelSelected: { color: COLORS.primary, fontWeight: '700' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  continueBtn: { borderRadius: 12 },
  skipBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  skipText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
});
