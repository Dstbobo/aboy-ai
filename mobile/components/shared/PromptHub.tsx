import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/layout/AppScreen';
import { useUIStore } from '@/stores/ui.store';
import { COLORS } from '@/constants/theme';

export interface PromptAction {
  icon: string;
  title: string;
  subtitle: string;
  prompt: string;
}

interface PromptHubProps {
  title: string;
  intro: string;
  actions: PromptAction[];
}

/**
 * A guided feature screen: tapping a card drops a structured, expert prompt
 * into the chat (RAG-backed, fully cited) so the user gets specialist help
 * without prompt-engineering themselves.
 */
export function PromptHub({ title, intro, actions }: PromptHubProps) {
  const router = useRouter();
  const setPendingPrompt = useUIStore((s) => s.setPendingPrompt);

  function launch(prompt: string) {
    setPendingPrompt(prompt);
    router.push('/(clinical)/chat');
  }

  return (
    <AppScreen title={title}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{intro}</Text>
        {actions.map((a) => (
          <TouchableOpacity key={a.title} style={styles.card} onPress={() => launch(a.prompt)} activeOpacity={0.7}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name={a.icon as any} size={24} color={COLORS.primary} />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.cardTitle}>{a.title}</Text>
              <Text style={styles.cardSub}>{a.subtitle}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 21, marginBottom: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  cardTitle: { fontSize: 15.5, fontWeight: '700', color: COLORS.text },
  cardSub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3, lineHeight: 17 },
});
