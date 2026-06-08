import React, { useState } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import type { Citation } from '@/stores/chat.store';
import { COLORS } from '@/constants/theme';

interface Props {
  citations: Citation[];
}

export function CitationCard({ citations }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!citations.length) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.header}>
        <Text style={styles.headerText}>
          {expanded ? '▼' : '▶'} {citations.length} source{citations.length > 1 ? 's' : ''}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.list}>
          {citations.map((c, i) => (
            <View key={i} style={styles.item}>
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={2}>
                  {i + 1}. {c.source_name}
                </Text>
                {c.evidence_grade && (
                  <Chip compact style={styles.chip} textStyle={styles.chipText}>
                    Grade {c.evidence_grade}
                  </Chip>
                )}
              </View>
              {c.section_title && (
                <Text style={styles.section}>{c.section_title}</Text>
              )}
              {c.url && (
                <Text
                  style={styles.url}
                  onPress={() => Linking.openURL(c.url!)}
                  numberOfLines={1}
                >
                  {c.url}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  header: { paddingVertical: 4 },
  headerText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  list: { gap: 10, marginTop: 8 },
  item: { backgroundColor: COLORS.secondary, borderRadius: 6, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  name: { flex: 1, fontWeight: '600', fontSize: 13, color: COLORS.text },
  section: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  url: { fontSize: 11, color: COLORS.primary, marginTop: 4, textDecorationLine: 'underline' },
  chip: { backgroundColor: COLORS.primaryLight, height: 22 },
  chipText: { fontSize: 10, color: '#fff' },
});
