import React from 'react';
import { SvgXml } from 'react-native-svg';

// Aboy AI mark: an "A" that is also an owl (ear tufts, amber eyes, beak) — the
// approved brand logo. Rendered on the green app tile. Single source of truth
// for the in-app logo; the native app icon/splash use PNGs exported from the
// same artwork (assets/).
const ICON_XML = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="46" fill="#0a5f52"/>
  <path d="M76 30 L93 84 L100 68 L107 84 L124 30 L119 100 L128 150 L151 176 L132 178 L104 142 L100 150 L96 142 L68 178 L49 176 L72 150 L81 100 Z" fill="#ffffff"/>
  <path d="M100 78 L95 90 L105 90 Z" fill="#0a5f52"/>
  <line x1="74" y1="95" x2="96" y2="101" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="126" y1="95" x2="104" y2="101" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="84" cy="112" r="15" fill="#f2a83b"/>
  <circle cx="116" cy="112" r="15" fill="#f2a83b"/>
  <circle cx="84" cy="113" r="6" fill="#1f2937"/>
  <circle cx="116" cy="113" r="6" fill="#1f2937"/>
  <circle cx="81" cy="109" r="2.5" fill="#ffffff"/>
  <circle cx="113" cy="109" r="2.5" fill="#ffffff"/>
  <path d="M93 122 L107 122 L100 134 Z" fill="#1f2937"/>
</svg>`;

export function AboyLogo({ size = 32 }: { size?: number }) {
  return <SvgXml xml={ICON_XML} width={size} height={size} />;
}
