import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Pressable,
  Dimensions,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { getDrawerItems } from '@/constants/navigation';
import { ROLE_LABELS, getRoleIcon, type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(320, SCREEN_W * 0.84);

export function SideDrawer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { drawerOpen, closeDrawer } = useUIStore();
  const setPendingPrompt = useUIStore((s) => s.setPendingPrompt);
  const user = useAuthStore((s) => s.user);
  const clearChat = useChatStore((s) => s.clearChat);

  const role = (user?.role ?? 'student_med') as UserRole;
  const items = getDrawerItems(role);

  const translateX = useRef(new Animated.Value(-DRAWER_W)).current;
  const overlay = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: drawerOpen ? 0 : -DRAWER_W,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(overlay, {
        toValue: drawerOpen ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [drawerOpen, translateX, overlay]);

  function handlePress(route: string, key: string) {
    closeDrawer();
    if (key === 'new') {
      clearChat();
      router.replace('/(clinical)/chat');
      return;
    }
    if (key === 'quiz') {
      // Start a fresh quiz session in chat (prefilled prompt; user taps send).
      clearChat();
      setPendingPrompt(
        'Quiz me with 5 short questions, one at a time, on a topic I have been studying. ' +
        'After each answer, tell me if I am right and explain briefly.',
      );
      router.replace('/(clinical)/chat');
      return;
    }
    router.push(route as any);
  }

  return (
    <View style={styles.root} pointerEvents={drawerOpen ? 'auto' : 'none'}>
      {/* Dim overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          styles.panel,
          { width: DRAWER_W, paddingTop: insets.top + 8, transform: [{ translateX }] },
        ]}
      >
        {/* Brand */}
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoLetter}>A</Text>
          </View>
          <Text style={styles.brandName}>Aboy AI</Text>
        </View>

        {/* Nav items */}
        <ScrollView style={styles.items} showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            const active = item.key !== 'new' && pathname.includes(item.route.split('/').pop() ?? '');
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.item, active && styles.itemActive]}
                onPress={() => handlePress(item.route, item.key)}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={22}
                  color={active ? COLORS.primary : COLORS.text}
                />
                <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* User footer */}
        <TouchableOpacity
          style={[styles.userRow, { paddingBottom: insets.bottom + 12 }]}
          onPress={() => handlePress('/(clinical)/settings', 'settings')}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarIcon}>{getRoleIcon(role)}</Text>
          </View>
          <View style={styles.userText}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.fullName || user?.email || 'Account'}
            </Text>
            <Text style={styles.userRole} numberOfLines={1}>
              {ROLE_LABELS[role] ?? 'Member'}
            </Text>
          </View>
          <MaterialCommunityIcons name="cog" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: COLORS.border,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 2, height: 0 },
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { color: '#fff', fontSize: 18, fontWeight: '800' },
  brandName: { fontSize: 19, fontWeight: '800', color: COLORS.text },
  items: { flex: 1, paddingTop: 10, paddingHorizontal: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  itemActive: { backgroundColor: COLORS.secondary },
  itemLabel: { fontSize: 15.5, color: COLORS.text, fontWeight: '500' },
  itemLabelActive: { color: COLORS.primary, fontWeight: '700' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 18 },
  userText: { flex: 1 },
  userName: { fontSize: 14.5, fontWeight: '600', color: COLORS.text },
  userRole: { fontSize: 12.5, color: COLORS.textSecondary },
});
