import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';

export interface LegalSection {
  heading: string;
  body: string;
}

interface Props {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
}

/** Simple scrollable legal document with a back header. */
export function LegalDoc({ title, updated, intro, sections }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.back} hitSlop={10} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.updated}>Last updated: {updated}</Text>
        {!!intro && <Text style={styles.intro}>{intro}</Text>}
        {sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  content: { paddingHorizontal: 20, paddingTop: 14 },
  updated: { fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 14 },
  intro: { fontSize: 14.5, color: COLORS.text, lineHeight: 22, marginBottom: 18 },
  section: { marginBottom: 18 },
  heading: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  body: { fontSize: 14, color: COLORS.text, lineHeight: 21 },
});
