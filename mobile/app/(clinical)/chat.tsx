import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TextInput as RNTextInput,
} from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { useChatStore } from '@/stores/chat.store';
import { useOfflineStore } from '@/stores/offline.store';
import { sendQuery } from '@/services/query.service';
import { COLORS } from '@/constants/theme';
import { ROLE_LABELS } from '@/constants/roles';
import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@/constants/roles';

export default function ChatScreen() {
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { messages, sessionId, isLoading, setLoading, addUserMessage, addAssistantMessage, setSession } = useChatStore();
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
      addAssistantMessage(result.session_id + Date.now(), result.answer, result.citations, result.emergency_triggered);
      scrollToBottom();
    } catch (e: any) {
      addAssistantMessage('err' + Date.now(), 'Sorry, I encountered an error. Please try again.', [], false);
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = ROLE_LABELS[user?.role as UserRole] ?? 'Student';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <OfflineBanner />

      {messages.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏥</Text>
          <Text style={styles.emptyTitle}>Aboy AI</Text>
          <Text style={styles.emptySubtitle}>
            Ask any healthcare or study question.{'\n'}All answers are cited from verified sources.
          </Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToBottom}
      />

      {isLoading && <LoadingSkeleton />}

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 4 }]}>
        <RNTextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask a healthcare question…"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.textInput}
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <IconButton
          icon="send"
          size={24}
          iconColor="#fff"
          containerColor={input.trim() ? COLORS.primary : COLORS.border}
          onPress={handleSend}
          disabled={!input.trim() || isLoading}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 16, paddingBottom: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: COLORS.primary, marginBottom: 8 },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 4,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
