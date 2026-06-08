import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppHeader } from './AppHeader';
import { SideDrawer } from './SideDrawer';
import { PlusSheet } from './PlusSheet';

interface AppScreenProps {
  children: React.ReactNode;
  variant?: 'menu' | 'back';
  title?: string;
  showOptions?: boolean;
  onOptions?: () => void;
  /** Set false to hide the bottom + sheet (screens without an input bar). */
  withPlusSheet?: boolean;
}

/**
 * Standard Claude-style screen chrome:
 *   white top bar (hamburger | Aboy AI | three-dots)
 *   + global side drawer overlay
 *   + optional bottom + sheet
 */
export function AppScreen({
  children,
  variant = 'menu',
  title,
  showOptions = true,
  onOptions,
  withPlusSheet = false,
}: AppScreenProps) {
  return (
    <View style={styles.root}>
      <AppHeader variant={variant} title={title} showOptions={showOptions} onOptions={onOptions} />
      <View style={styles.body}>{children}</View>
      <SideDrawer />
      {withPlusSheet && <PlusSheet />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  body: { flex: 1 },
});
