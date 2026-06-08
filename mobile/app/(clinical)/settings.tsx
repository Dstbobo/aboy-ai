import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/layout/AppScreen';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { ROLE_LABELS, getRoleIcon, type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const beginOnboarding = useAuthStore((s) => s.beginOnboarding);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearChat = useChatStore((s) => s.clearChat);
  const [notifications, setNotifications] = useState(true);

  const role = (user?.role ?? 'student_med') as UserRole;

  async function handleChangeRole() {
    await beginOnboarding();
    router.replace('/(auth)/onboarding-role');
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

  return (
    <AppScreen title="Settings">
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile card */}
        <Text style={styles.sectionLabel}>PROFILE</Text>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarIcon}>{getRoleIcon(role)}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{user?.fullName || 'Your name'}</Text>
            <Text style={styles.profileRole}>{ROLE_LABELS[role] ?? 'Member'}</Text>
            {user?.subRole ? <Text style={styles.profileSpecialty}>{user.subRole}</Text> : null}
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* Account actions */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.group}>
          <Row icon="account-switch" label="Change Role" onPress={handleChangeRole} />
          <Divider />
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

        {/* Sign out */}
        <View style={styles.group}>
          <Row icon="logout" label="Sign Out" destructive onPress={handleSignOut} />
        </View>

        <Text style={styles.version}>Aboy AI · v1.0.0</Text>
      </ScrollView>
    </AppScreen>
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
      <MaterialCommunityIcons
        name={icon as any}
        size={22}
        color={destructive ? COLORS.error : COLORS.text}
      />
      <Text style={[styles.rowLabel, destructive && { color: COLORS.error }]}>{label}</Text>
      {!destructive && (
        <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
      )}
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 8,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 26 },
  profileText: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  profileRole: { fontSize: 14, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  profileSpecialty: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  profileEmail: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 4 },
  group: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowLabel: { flex: 1, fontSize: 15.5, color: COLORS.text, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 52 },
  version: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 12, marginTop: 8 },
});
