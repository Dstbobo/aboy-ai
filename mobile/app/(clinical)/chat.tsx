import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import Voice from '@react-native-voice/voice';
import { AppScreen } from '@/components/layout/AppScreen';
import { VoiceDock } from '@/components/voice/VoiceDock';
import { useChatStore } from '@/stores/chat.store';
import { useOfflineStore } from '@/stores/offline.store';
import { useUIStore } from '@/stores/ui.store';
import { sendQuery } from '@/services/query.service';
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
  const voiceModeOpen = useUIStore((s) => s.voiceModeOpen);

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? inputText).trim();
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

  // ── Mic recording bar: X (cancel) | live waveform | ✓ (send as text) ──
  // On-device speech recognition (@react-native-voice/voice): words appear
  // INSTANTLY via onSpeechPartialResults; waveform reacts via volume events.
  const BAR_COUNT = 22;
  const waveLevels = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15)),
  ).current;
  const [isListening, setIsListening] = useState(false);
  const listeningRef = useRef(false);
  const [liveWords, setLiveWords] = useState('');
  const finalWordsRef = useRef(''); // committed segments across pauses
  const liveWordsRef = useRef('');

  useEffect(() => {
    Voice.onSpeechPartialResults = (e: any) => {
      const partial = e?.value?.[0] ?? '';
      const combined = (finalWordsRef.current + ' ' + partial).trim();
      liveWordsRef.current = combined;
      setLiveWords(combined);
    };
    Voice.onSpeechResults = (e: any) => {
      const final = e?.value?.[0] ?? '';
      if (final) {
        finalWordsRef.current = (finalWordsRef.current + ' ' + final).trim();
        liveWordsRef.current = finalWordsRef.current;
        setLiveWords(finalWordsRef.current);
      }
    };
    Voice.onSpeechVolumeChanged = (e: any) => {
      // e.value ≈ 0..10 on Android
      const norm = Math.max(0.08, Math.min(1, (e?.value ?? 0) / 10));
      const i = Math.floor(Math.random() * BAR_COUNT);
      Animated.timing(waveLevels[i], { toValue: norm, duration: 100, useNativeDriver: false }).start();
    };
    Voice.onSpeechEnd = () => {
      // Android stops after a pause — restart so the bar keeps listening
      // until the user taps ✓ or ✕.
      if (listeningRef.current) Voice.start('en-US').catch(() => {});
    };
    Voice.onSpeechError = (e: any) => {
      const code = String(e?.error?.code ?? '');
      // 7 = no match, 6 = speech timeout — keep listening through these.
      if (listeningRef.current && (code === '7' || code === '6')) {
        Voice.start('en-US').catch(() => {});
      } else if (listeningRef.current) {
        console.warn('[stt] error', e?.error);
      }
    };
    return () => {
      Voice.destroy().then(() => Voice.removeAllListeners()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beginRecording() {
    finalWordsRef.current = '';
    liveWordsRef.current = '';
    setLiveWords('');
    try {
      setIsListening(true);
      listeningRef.current = true;
      await Voice.start('en-US');
    } catch (e) {
      console.warn('[stt] start failed', (e as Error)?.message);
      setIsListening(false);
    }
  }

  async function cancelRecording() {
    setIsListening(false);
    listeningRef.current = false;
    try {
      await Voice.stop();
      await Voice.cancel();
    } catch {}
    setLiveWords('');
    finalWordsRef.current = '';
    liveWordsRef.current = '';
  }

  async function confirmRecording() {
    setIsListening(false);
    listeningRef.current = false;
    try {
      await Voice.stop();
    } catch {}
    const text = liveWordsRef.current.trim();
    setLiveWords('');
    finalWordsRef.current = '';
    liveWordsRef.current = '';
    if (text) await sendMessage(text); // spoken words sent as a text message
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
      <TouchableOpacity style={styles.sendCircle} onPress={() => sendMessage()} hitSlop={6}>
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

            {/* Voice active: dock replaces the input bar, chat stays above */}
            {voiceModeOpen ? (
              <VoiceDock />
            ) : isListening ? (
              <View>
                {/* Live words — italic, above the bar, in real time */}
                {!!liveWords && (
                  <Text style={styles.liveWords} numberOfLines={3}>
                    {liveWords}
                  </Text>
                )}
                <View style={styles.inputCard}>
                  {/* X — cancel */}
                  <TouchableOpacity style={styles.micBtn} onPress={cancelRecording} hitSlop={6}>
                    <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
                  </TouchableOpacity>

                  {/* Animated waveform reacting to the voice */}
                  <View style={styles.waveform}>
                    {waveLevels.map((v, i) => (
                      <Animated.View
                        key={i}
                        style={[
                          styles.waveBar,
                          { height: v.interpolate({ inputRange: [0, 1], outputRange: [4, 30] }) },
                        ]}
                      />
                    ))}
                  </View>

                  {/* ✓ — confirm: send spoken words as a text message */}
                  <TouchableOpacity style={styles.confirmBtn} onPress={confirmRecording} hitSlop={6}>
                    <MaterialCommunityIcons name="check" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
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

              <TouchableOpacity style={styles.micBtn} onPress={beginRecording} hitSlop={6}>
                <MaterialCommunityIcons name="microphone-outline" size={22} color={COLORS.text} />
              </TouchableOpacity>

              {rightControl}
            </View>
            )}
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
  liveWords: {
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textSecondary,
    paddingHorizontal: 22,
    marginBottom: 6,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 40,
    paddingHorizontal: 8,
  },
  waveBar: {
    width: 3.5,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  confirmBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
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
