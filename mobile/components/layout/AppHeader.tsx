import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUIStore } from '@/stores/ui.store';
import { COLORS } from '@/constants/theme';

interface AppHeaderProps {
  /** "menu" shows the hamburger (default); "back" shows a back arrow. */
  variant?: 'menu' | 'back';
  /** Override the title shown in the centre (defaults to the Aboy AI logo + name). */
  title?: string;
  /** Show the right-hand three-dots button (default true). */
  showOptions?: boolean;
  onOptions?: () => void;
}

export function AppHeader({
  variant = 'menu',
  title,
  showOptions = true,
  onOptions,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openDrawer = useUIStore((s) => s.openDrawer);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {/* Left */}
        <TouchableOpacity
          style={styles.iconBtn}
          hitSlop={8}
          onPress={() => (variant === 'back' ? router.back() : openDrawer())}
          accessibilityLabel={variant === 'back' ? 'Go back' : 'Open menu'}
        >
          <MaterialCommunityIcons
            name={variant === 'back' ? 'arrow-left' : 'menu'}
            size={26}
            color={COLORS.text}
          />
        </TouchableOpacity>

        {/* Center */}
        <View style={styles.center} pointerEvents="none">
          {title ? (
            <Text style={styles.title}>{title}</Text>
          ) : (
            <View style={styles.brand}>
              <View style={styles.logo}>
                <Text style={styles.logoLetter}>A</Text>
              </View>
              <Text style={styles.brandName}>Aboy AI</Text>
            </View>
          )}
        </View>

        {/* Right */}
        {showOptions ? (
          <TouchableOpacity
            style={styles.iconBtn}
            hitSlop={8}
            onPress={onOptions ?? (() => router.push('/(clinical)/settings'))}
            accessibilityLabel="More options"
          >
            <MaterialCommunityIcons name="dots-vertical" size={24} color={COLORS.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { color: '#fff', fontSize: 16, fontWeight: '800' },
  brandName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
});
