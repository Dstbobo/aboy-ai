import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppScreen } from '@/components/layout/AppScreen';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { useProgressStore } from '@/stores/progress.store';
import { api } from '@/services/api';
import { getUsage, type Usage } from '@/services/usage.service';
import { ROLE_CATEGORIES, ROLE_LABELS, getRoleIcon, type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

interface Profile {
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  sub_role?: string | null;
  specialty?: string | null;
  institution?: string | null;
  country_code?: string | null;
  graduation_year?: number | null;
  pending_role_request?: { to_role: string; status: string } | null;
}

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearChat = useChatStore((s) => s.clearChat);
  const { topics, totalQueries } = useProgressStore();
  const [notifications, setNotifications] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const role = (profile?.role ?? user?.role ?? 'student_med') as UserRole;
  const pending = profile?.pending_role_request;

  useEffect(() => {
    api
      .get<Profile>('/api/v1/profile')
      .then((r) => setProfile(r.data))
      .catch(() => {});
    getUsage()
      .then(setUsage)
      .catch(() => {});
  }, []);

  const usagePct = usage && usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;

  async function submitRoleChange(toRole: UserRole) {
    setRolePickerOpen(false);
    try {
      await api.post('/api/v1/profile/role-change', { to_role: toRole });
      setProfile((p) => (p ? { ...p, pending_role_request: { to_role: toRole, status: 'pending' } } : p));
      Alert.alert('Submitted', 'Your role change was sent to an admin for review.');
    } catch {
      Alert.alert('Error', 'Could not submit the request. Please try again.');
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          clearChat();
          await clearAuth();
          router.replace('/(auth)/landing');
        },
      },
    ]);
  }

  const details: { label: string; value: string }[] = [
    { label: 'Name', value: profile?.full_name || user?.fullName || '—' },
    { label: 'Role', value: ROLE_LABELS[role] ?? role },
    { label: 'Specialty', value: profile?.sub_role || profile?.specialty || user?.subRole || '—' },
    { label: 'Year', value: profile?.graduation_year ? String(profile.graduation_year) : '—' },
    { label: 'Institution', value: profile?.institution || '—' },
    { label: 'Country', value: profile?.country_code || '—' },
    { label: 'Email', value: profile?.email || user?.email || '—' },
  ];

  const topicCount = Object.keys(topics).length;

  return (
    <AppScreen title="Settings">
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile details */}
        <Text style={styles.sectionLabel}>PROFILE</Text>
        <View style={styles.card}>
          <View style={styles.profileTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarIcon}>{getRoleIcon(role)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{details[0].value}</Text>
              <Text style={styles.profileRole}>{details[1].value}</Text>
            </View>
          </View>
          {details.slice(2).map((d) => (
            <View key={d.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{d.label}</Text>
              <Text style={styles.detailValue}>{d.value}</Text>
            </View>
          ))}
        </View>

        {/* Role change */}
        <Text style={styles.sectionLabel}>ROLE</Text>
        <View style={styles.card}>
          {pending ? (
            <View style={styles.pendingRow}>
              <MaterialCommunityIcons name="clock-outline" size={22} color={COLORS.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Role change pending review</Text>
                <Text style={styles.rowSub}>
                  Requested: {ROLE_LABELS[pending.to_role] ?? pending.to_role} — an admin will review it.
                </Text>
              </View>
            </View>
          ) : (
            <Row icon="account-switch" label="Request role change" onPress={() => setRolePickerOpen(true)} />
          )}
        </View>

        {/* Learning progress */}
        <Text style={styles.sectionLabel}>LEARNING PROGRESS</Text>
        <TouchableOpacity style={styles.card} onPress={() => router.push('/(clinical)/study')} activeOpacity={0.7}>
          <View style={styles.progressRow}>
            <View style={styles.progressStat}>
              <Text style={styles.progressNum}>{totalQueries}</Text>
              <Text style={styles.progressLabel}>questions</Text>
            </View>
            <View style={styles.progressStat}>
              <Text style={styles.progressNum}>{topicCount}</Text>
              <Text style={styles.progressLabel}>topics</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Text style={styles.progressLink}>View details ›</Text>
          </View>
        </TouchableOpacity>

        {/* Daily usage */}
        <Text style={styles.sectionLabel}>USAGE</Text>
        <View style={styles.card}>
          <View style={styles.usageTop}>
            <MaterialCommunityIcons name="lightning-bolt" size={22} color={COLORS.primary} />
            <Text style={styles.rowLabel}>
              Tokens used today: {usage ? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()}` : '—'}
            </Text>
          </View>
          <View style={styles.usageBarTrack}>
            <View style={[styles.usageBarFill, { width: `${usagePct}%` }]} />
          </View>
          <Text style={styles.usageReset}>Resets at midnight</Text>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="bell-outline" size={22} color={COLORS.text} />
            <Text style={styles.rowLabel}>Notifications</Text>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ true: COLORS.primary, false: COLORS.border }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>LEGAL</Text>
        <View style={styles.card}>
          <Row icon="shield-lock-outline" label="Privacy Policy" onPress={() => router.push('/(legal)/privacy')} />
          <View style={styles.legalDivider} />
          <Row icon="file-document-outline" label="Terms & Conditions" onPress={() => router.push('/(legal)/terms')} />
        </View>

        <View style={styles.card}>
          <Row icon="logout" label="Sign Out" destructive onPress={handleSignOut} />
        </View>

        <Text style={styles.version}>Aboy AI · v1.0.0</Text>
      </ScrollView>

      <RolePickerModal
        open={rolePickerOpen}
        currentRole={role}
        onClose={() => setRolePickerOpen(false)}
        onSelect={submitRoleChange}
      />
    </AppScreen>
  );
}

function RolePickerModal({
  open,
  currentRole,
  onClose,
  onSelect,
}: {
  open: boolean;
  currentRole: UserRole;
  onClose: () => void;
  onSelect: (r: UserRole) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const allRoles = useMemo(
    () => ROLE_CATEGORIES.flatMap((c) => c.roles.map((r) => ({ ...r, category: c.label }))),
    [],
  );
  const visible = allRoles.filter(
    (r) => r.id !== currentRole && r.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12, maxHeight: '75%' }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Request a role change</Text>
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search roles…"
              placeholderTextColor={COLORS.textSecondary}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          <ScrollView>
            {visible.map((r) => (
              <TouchableOpacity key={r.id} style={styles.pickRow} onPress={() => onSelect(r.id)}>
                <Text style={{ fontSize: 18 }}>{r.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <Text style={styles.rowSub}>{r.category}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <MaterialCommunityIcons name={icon as any} size={22} color={destructive ? COLORS.error : COLORS.text} />
      <Text style={[styles.rowLabel, destructive && { color: COLORS.error }]}>{label}</Text>
      {!destructive && <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textSecondary,
    letterSpacing: 0.8, marginBottom: 8, marginTop: 10,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, overflow: 'hidden',
    paddingHorizontal: 16, paddingVertical: 6,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
  },
  avatarIcon: { fontSize: 24 },
  profileName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  profileRole: { fontSize: 13.5, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  detailLabel: { fontSize: 14, color: COLORS.textSecondary },
  detailValue: { fontSize: 14, color: COLORS.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowSub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 18 },
  progressStat: { alignItems: 'center' },
  progressNum: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  progressLabel: { fontSize: 11.5, color: COLORS.textSecondary },
  progressLink: { fontSize: 13.5, color: COLORS.primary, fontWeight: '600' },
  version: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 12, marginTop: 10 },
  legalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 36 },
  usageTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  usageBarTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.border, marginTop: 12, overflow: 'hidden' },
  usageBarFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  usageReset: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 8, paddingBottom: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 10, paddingHorizontal: 18,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.background, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14.5, color: COLORS.text },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
});
