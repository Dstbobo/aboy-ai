import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Citation } from '@/stores/chat.store';
import { COLORS } from '@/constants/theme';

interface Props {
  citations: Citation[];
}

type Source = { label: string; url: string | null; host: string };

// Subdomains that add no meaning to the displayed site name.
const NOISE_SUB = /^(?:www|m|mobile|my|post|amp|cdn\d*|img\d*|image[s]?|media|assets|static|i\d*|s\d*|secure|en)\./;

function hostFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.replace(NOISE_SUB, '');
  } catch {
    return '';
  }
}

function faviconFor(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
}

// One favicon with a graceful fallback to a globe icon if it fails to load.
function Favicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false);
  if (!host || failed) {
    return <MaterialCommunityIcons name="web" size={13} color={COLORS.textSecondary} />;
  }
  return (
    <Image
      source={{ uri: faviconFor(host) }}
      style={styles.favicon}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Sources shown the way ChatGPT/Gemini/Claude do: a subtle row of chips below
 * the answer, each with the site's favicon + name, tappable to open. No inline
 * [Web 1] markers (those are stripped server-side). De-duplicated by site.
 */
export function CitationCard({ citations }: Props) {
  if (!citations.length) return null;

  // De-duplicate by host (web) or by name (knowledge-base entries with no URL).
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const c of citations) {
    const host = c.url ? hostFromUrl(c.url) : '';
    const key = host || (c.source_name || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push({ label: host || c.source_name || 'Source', url: c.url, host });
  }
  if (!sources.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Sources</Text>
      <View style={styles.row}>
        {sources.map((s, i) => (
          <TouchableOpacity
            key={i}
            style={styles.chip}
            activeOpacity={0.7}
            disabled={!s.url}
            onPress={() => s.url && Linking.openURL(s.url)}
          >
            <Favicon host={s.host} />
            <Text style={styles.chipText} numberOfLines={1}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  label: {
    fontSize: 11,
    color: COLORS.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 6,
    opacity: 0.8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.secondary,
    borderRadius: 13,
    paddingVertical: 4,
    paddingHorizontal: 9,
    maxWidth: 220,
  },
  favicon: { width: 14, height: 14, borderRadius: 3 },
  chipText: { fontSize: 11.5, color: COLORS.textSecondary },
});
