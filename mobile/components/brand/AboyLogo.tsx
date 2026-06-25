import React from 'react';
import { Image } from 'react-native';

// Aboy AI mark: the owl-A-cross emblem (brand logo). Single source of truth for
// the in-app logo; the native app icon/splash use PNGs exported from the same
// artwork (assets/). Rendered from a transparent circular PNG so it sits cleanly
// on any background.
const MARK = require('../../assets/logo-mark.png');

export function AboyLogo({ size = 32 }: { size?: number }) {
  return <Image source={MARK} style={{ width: size, height: size }} resizeMode="contain" />;
}
