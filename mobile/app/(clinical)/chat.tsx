import React, { useState, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { AppScreen } from '@/components/layout/AppScreen';
import { useChatStore } from '@/stores/chat.store';
import { useOfflineStore } from '@/stores/offline.store';
import { useUIStore } from '@/stores/ui.store';
import { useRecorder } from '@/hooks/useRecorder';
import { sendQuery } from '@/services/query.service';
import { transcribeAudio } from '@/services/transcribe.service';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';

// Height of the custom top bar (AppHeader) that sits above the chat body.
const HEADER_HEIGHT = 56;

// Home (no chat yet): white fading into soft Aboy green.
const HOME_GRADIENT = ['#ffffff', '#f2faf7', '#d7ece5'] as const;
// During a chat: a different, subtle soft gradient.
const CHAT_GRADIENT = ['#ffffff', '#fbfcfe', '#eef3fa'] as const;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
  const openVoiceMode = useUIStore((s) => s.openVoiceMode);
  const { isRecording, start, stop } = useRecorder();

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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await sendQuery(text, sessionId, controller.signal);
      if (!sessionId) setSession(result.session_id);
      addAssistantMessage(
        result.session_id + Date.now(),
        result.answer,
        result.citations,
        result.emergency_triggered,
      );
    } catch (e: any) {
      const canceled = e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || controller.signal.aborted;
      if (!canceled) {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;
        console.warn('[chat] query failed', { status, detail, message: e?.message, code: e?.code });
        let friendly = 'Sorry, I encountered an error. Please try again.';
        if (status === 401) friendly = 'Your session expired. Please sign out and sign in again.';
        else if (status === 429) friendly = 'You’ve hit the daily query limit. Please try again later.';
        else if (status === 503) friendly = 'The AI service is temporarily unavailable. Please try again shortly.';
        else if (e?.code === 'ECONNABORTED') friendly = 'The request timed out. Please check your connection and try again.';
        else if (!status) friendly = 'Network error — please check your connection and try again.';
        addAssistantMessage('err' + Date.now(), friendly, [], false);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function stopGenerating() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  // Tap-to-talk: tap to record, tap again to stop + transcribe into the input.
  async function toggleTalk() {
    if (isRecording) {
      const uri = await stop();
      if (!uri) return;
      setIsTranscribing(true);
      try {
        const text = (await transcribeAudio(uri)).trim();
        if (text) setInputText((prev) => (prev ? `${prev} ${text}` : text));
      } catch {
        // user can retry
      } finally {
        setIsTranscribing(false);
      }
    } else {
      await start();
    }
  }

  const hasChat = messages.length > 0;
  const isTyping = inputText.trim().length > 0;
  const data = [...messages].reverse(); // inverted list shows newest at the bottom
  const firstName = (user?.fullName || '').split(' ')[0];

  // Right-side control: stop (AI responding) > send (typing) > waveform pill (default).
  let rightControl: React.ReactNode;
  if (isLoading) {
    rightControl = (
      <TouchableOpacity style={styles.stopCircle} onPress={stopGenerating} hitSlop={6}>
        <MaterialCommunityIcons name="stop" size={20} color="#fff" />
      </TouchableOpacity>
    );
  } else if (isTyping) {
    rightControl = (
      <TouchableOpacity style={styles.sendCircle} onPress={sendMessage} hitSlop={6}>
        <MaterialCommunityIcons name="arrow-up" size={20} color="#fff" />
      </TouchableOpacity>
    );
  } else {
    rightControl = (
      <TouchableOpacity style={styles.wavePill} onPress={openVoiceMode} hitSlop={6}>
        <MaterialCommunityIcons name="waveform" size={22} color="#fff" />
      </TouchableOpacity>
    );
  }

  return (
    <AppScreen withPlusSheet>
      <LinearGradient
        colors={hasChat ? [...CHAT_GRADIENT] : [...HOME_GRADIENT]}
        locations={[0, 0.5, 1]}
        style={styles.flex}
      >
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior="padding"
            keyboardVerticalOffset={insets.top + HEADER_HEIGHT}
          >
            <OfflineBanner />

            {!hasChat ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyLogo}>
                  <Text style={styles.emptyLogoLetter}>A</Text>
                </View>
                <Text style={styles.emptyTitle}>
                  {firstName ? `Hello, ${firstName}` : 'How can I help?'}
                </Text>
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

            {/* Gemini-style input bar: + | text | mic | pill/send/stop */}
            <View style={styles.inputCard}>
              <TouchableOpacity style={styles.plusBtn} onPress={openPlusSheet} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={24} color={COLORS.text} />
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
                style={[styles.micBtn, isRecording && styles.micBtnActive]}
                onPress={toggleTalk}
                disabled={isTranscribing}
                hitSlop={6}
              >
                {isTranscribing ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <MaterialCommunityIcons
                    name={isRecording ? 'stop' : 'microphone-outline'}
                    size={22}
                    color={isRecording ? '#fff' : COLORS.text}
                  />
                )}
              </TouchableOpacity>

              {rightControl}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 16 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyLogo: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyLogoLetter: { color: '#fff', fontSize: 36, fontWeight: '800' },
  emptyTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  emptySubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },

  // White card, soft shadow, no hard border, on a light background.
  inputCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
  plusBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.text,
    maxHeight: 120,
    paddingHorizontal: 6,
    paddingTop: 9,
    paddingBottom: 9,
  },
  micBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: COLORS.error },
  wavePill: {
    minWidth: 56, height: 40, borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2,
  },
  sendCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2,
  },
  stopCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.text,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2,
  },
});
