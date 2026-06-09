import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { AppScreen } from '@/components/layout/AppScreen';
import { ChatInputBar } from '@/components/layout/ChatInputBar';
import { useChatStore } from '@/stores/chat.store';
import { useOfflineStore } from '@/stores/offline.store';
import { sendQuery } from '@/services/query.service';
import { COLORS } from '@/constants/theme';
import { ROLE_LABELS } from '@/constants/roles';
import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@/constants/roles';

// Top bar height defined in AppHeader (56) — used so KeyboardAvoidingView
// knows how much vertical space sits above the chat body.
const HEADER_HEIGHT = 56;

export default function ChatScreen() {
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
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

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');

    if (isOffline) {
      addUserMessage(text);
      enqueueQuery(text, sessionId);
      return;
    }

    addUserMessage(text);
    setLoading(true);
    scrollToBottom();

    try {
      const result = await sendQuery(text, sessionId);
      if (!sessionId) setSession(result.session_id);
      addAssistantMessage(
        result.session_id + Date.now(),
        result.answer,
        result.citations,
        result.emergency_triggered,
      );
      scrollToBottom();
    } catch (e: any) {
      addAssistantMessage('err' + Date.now(), 'Sorry, I encountered an error. Please try again.', [], false);
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = ROLE_LABELS[user?.role as UserRole] ?? 'Student';

  return (
    <AppScreen withPlusSheet>
      <KeyboardAvoidingView
        style={styles.flex}
        // iOS: pad the bottom by the keyboard height (offset accounts for the
        // custom top bar + status bar). Android: rely on windowSoftInputMode
        // "resize" (set in app.json) which shrinks the window so the input bar
        // lifts naturally — adding behavior here would double-compensate.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            <View style={styles.roleChip}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.list}
            onContentSizeChange={scrollToBottom}
          />
        )}

        {isLoading && <LoadingSkeleton />}

        <ChatInputBar
          value={input}
          onChangeText={setInput}
          onSend={handleSend}
          disabled={isLoading}
        />
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  list: { padding: 16, paddingBottom: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyLogoLetter: { color: '#fff', fontSize: 36, fontWeight: '800' },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  roleChip: {
    backgroundColor: COLORS.secondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  roleText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
});
