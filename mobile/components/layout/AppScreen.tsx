import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from './AppHeader';
import { SideDrawer } from './SideDrawer';
import { PlusSheet } from './PlusSheet';
import { OptionsSheet } from './OptionsSheet';
import { VideoMode } from '@/components/voice/VideoMode';

const HEADER_HEIGHT = 56;

interface AppScreenProps {
  children: React.ReactNode;
  variant?: 'menu' | 'back';
  title?: string;
  showOptions?: boolean;
  onOptions?: () => void;
  /** Set false to hide the bottom + sheet (screens without an input bar). */
  withPlusSheet?: boolean;
  /**
   * Content fills the whole screen and scrolls underneath the transparent
   * header (Gemini-style). The screen must pad its own top content.
   * Default false: body starts below the header.
   */
  edgeToEdge?: boolean;
}

/**
 * Screen chrome: TRANSPARENT floating top bar (hamburger | Aboy AI | dots)
 * over the content + global side drawer + sheets.
 */
export function AppScreen({
  children,
  variant = 'menu',
  title,
  showOptions = true,
  onOptions,
  withPlusSheet = false,
  edgeToEdge = false,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.body, !edgeToEdge && { paddingTop: insets.top + HEADER_HEIGHT }]}>
        {children}
      </View>

      {/* Floating transparent header */}
      <View style={styles.headerWrap} pointerEvents="box-none">
        <AppHeader variant={variant} title={title} showOptions={showOptions} onOptions={onOptions} />
      </View>

      <SideDrawer />
      <OptionsSheet />
      {withPlusSheet && (
        <>
          <PlusSheet />
          <VideoMode />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  body: { flex: 1 },
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 },
});
