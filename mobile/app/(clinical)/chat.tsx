import React, { useState, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Audio } from 'expo-av';
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
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

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

  // ── Voice recording (expo-av): hold mic to record, release to stop & send ──
  async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Please allow microphone access to record voice questions.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }

  async function stopRecording() {
    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
      return;
    }
    setIsRecording(false);
    recordingRef.current = null;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      if (uri) {
        // Audio captured and "sent" into the conversation. On-device speech-to-
        // text isn't wired yet, so we surface the voice note and prompt the user
        // to type for an AI answer.
        addUserMessage('🎤 Voice message');
        addAssistantMessage(
          'voice' + Date.now(),
          'I received your voice message. Voice transcription is coming soon — please type your question for now and I’ll answer with cited sources.',
          [],
          false,
        );
      }
    } catch {
      // swallow — recording already torn down
    }
  }

  const roleLabel = ROLE_LABELS[user?.role as UserRole] ?? 'Student';
  const data = [...messages].reverse(); // inverted list shows newest at the bottom

  return (
    <AppScreen withPlusSheet>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          // keyboard-controller's KeyboardAvoidingView works on BOTH platforms.
          // "padding" is the reliable behavior on Android (unlike "height").
          // The offset covers the custom top bar + status bar that sit above
          // this view, so the input bar lands exactly on top of the keyboard.
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
              <View style={styles.roleChip}>
                <Text style={styles.roleText}>{roleLabel}</Text>
              </View>
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

          {/* Input bar — directly below the list, inside the same KAV, no absolute positioning */}
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.iconBtn} onPress={openPlusSheet}>
              <Text style={styles.plusIcon}>＋</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Ask a healthcare question..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              value={inputText}
              onChangeText={setInputText}
            />

            <TouchableOpacity
              onPressIn={startRecording}
              onPressOut={stopRecording}
              style={styles.iconBtn}
            >
              <Text style={styles.micIcon}>{isRecording ? '🔴' : '🎤'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
              <Text style={styles.sendIcon}>↑</Text>
            </TouchableOpacity>
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
  emptySubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  roleChip: { backgroundColor: COLORS.secondary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  roleText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#D1D1D6',
    backgroundColor: '#fff',
  },
  iconBtn: { padding: 8 },
  plusIcon: { fontSize: 22, color: COLORS.text, fontWeight: '600' },
  micIcon: { fontSize: 20 },
  input: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 16,
    maxHeight: 120,
    color: COLORS.text,
  },
  sendBtn: {
    padding: 8,
    marginLeft: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { fontSize: 20, color: '#fff', fontWeight: '700', lineHeight: 22 },
});
