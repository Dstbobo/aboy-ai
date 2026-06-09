import React, { useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { AppScreen } from '@/components/layout/AppScreen';
import { useChatStore } from '@/stores/chat.store';
import { useOfflineStore } from '@/stores/offline.store';
import { useUIStore } from '@/stores/ui.store';
import { sendQuery } from '@/services/query.service';
import { COLORS } from '@/constants/theme';
import { ROLE_LABELS } from '@/constants/roles';
import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@/constants/roles';

// Height of the custom top bar (AppHeader) that sits above the chat body.
const HEADER_HEIGHT = 56;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');

  const user = useAuthStore((s) => s.user);
  const {
    messages,
    sessionId,
    isLoading,
    setLoading,
    addUserMessage,
    addAssistantMessage,
    setSession,
  } = useChatStore();
  const { isOffline, enqueueQuery } = useOfflineStore();
  const openPlusSheet = useUIStore((s) => s.openPlusSheet);

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');

    if (isOffline) {
      addUserMessage(text);
      enqueueQuery(text, sessionId);
      return;
    }

    addUserMessage(text);
    setLoading(true);

    try {
      const result = await sendQuery(text, sessionId);
      if (!sessionId) setSession(result.session_id);
      addAssistantMessage(
        result.session_id + Date.now(),
        result.answer,
        result.citations,
        result.emergency_triggered,
      );
    } catch (e: any) {
      addAssistantMessage('err' + Date.now(), 'Sorry, I encountered an error. Please try again.', [], false);
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = ROLE_LABELS[user?.role as UserRole] ?? 'Student';
  const data = [...messages].reverse(); // inverted list shows newest at the bottom
  const canSend = inputText.trim().length > 0 && !isLoading;

  return (
    <AppScreen withPlusSheet>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          keyboardVerticalOffset={insets.top + HEADER_HEIGHT}
        >
          <OfflineBanner />

          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyLogo}>
                <Text style={styles.emptyLogoLetter}>A</Text>
              </View>
              <Text style={styles.emptyTitle}>How can I help?</Text>
              <Text style={styles.emptySubtitle}>
                Ask any healthcare or study question.{'\n'}Every answer is cited from verified sources.
              </Text>
            </View>
          ) : (
            <FlatList
              data={data}
              style={styles.flex}
              inverted
              keyboardShouldPersistTaps="handled"
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => <MessageBubble message={item} />}
            />
          )}

          {isLoading && <LoadingSkeleton />}

          {/* Floating rounded input card — Claude style */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.cardInput}
              placeholder="Ask a healthcare question..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              value={inputText}
              onChangeText={setInputText}
            />

            <View style={styles.cardBottomRow}>
              {/* Left: + pill */}
              <TouchableOpacity style={styles.plusPill} onPress={openPlusSheet} hitSlop={6}>
                <Text style={styles.plusPillIcon}>＋</Text>
              </TouchableOpacity>

              {/* Center: model / role pill */}
              <View style={styles.centerWrap}>
                <View style={styles.modelPill}>
                  <Text style={styles.modelPillText} numberOfLines={1}>{roleLabel}</Text>
                </View>
              </View>

              {/* Right: send circle */}
              <TouchableOpacity
                style={[styles.sendCircle, !canSend && styles.sendCircleOff]}
                onPress={sendMessage}
                disabled={!canSend}
                hitSlop={6}
              >
                <Text style={styles.sendArrow}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingVertical: 16 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyLogo: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyLogoLetter: { color: '#fff', fontSize: 36, fontWeight: '800' },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  emptySubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },

  // Floating rounded white card
  inputCard: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    // shadow / elevation for depth
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  cardInput: {
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.text,
    maxHeight: 120,
    minHeight: 24,
    paddingBottom: 8,
    paddingTop: 2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plusPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPillIcon: { fontSize: 20, color: COLORS.text, fontWeight: '600', lineHeight: 22 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  modelPill: {
    backgroundColor: '#F1F1F3',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  modelPillText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  sendCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircleOff: { backgroundColor: '#C7CBD1' },
  sendArrow: { fontSize: 20, color: '#fff', fontWeight: '800', lineHeight: 22 },
});
