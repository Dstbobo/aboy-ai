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
  Image,
  useWindowDimensions,
} from 'react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardStickyView, KeyboardEvents } from 'react-native-keyboard-controller';
import * as NavigationBar from 'expo-navigation-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { WelcomeHome } from '@/components/chat/WelcomeHome';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { ThinkingDots } from '@/components/chat/ThinkingDots';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { AppScreen } from '@/components/layout/AppScreen';
import { VoiceDock } from '@/components/voice/VoiceDock';
import { useChatStore } from '@/stores/chat.store';
import { useOfflineStore } from '@/stores/offline.store';
import { useUIStore } from '@/stores/ui.store';
import { streamQuery } from '@/services/streamQuery';
import { useImageAnalysis } from '@/hooks/useImageAnalysis';
import { analyzeDocument } from '@/services/document.service';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { useProgressStore } from '@/stores/progress.store';

// Height of the custom top bar (AppHeader) that sits above the chat body.
const HEADER_HEIGHT = 56;

// Role-aware conversation starters shown on the empty home screen.
function startersForRole(role: string): string[] {
  if (role.startsWith('pro_pharmacist')) {
    return ['Check a drug interaction', 'Dosing in renal impairment', 'Counsel a patient on warfarin'];
  }
  if (role === 'pro_senior' || role === 'pro_junior') {
    return ['Work through a differential', 'Latest guideline on sepsis', 'Interpret these lab results'];
  }
  if (role.startsWith('pro_nurse')) {
    return ['Pre-op checklist essentials', 'Pressure ulcer staging', 'IV fluid types explained'];
  }
  if (role.startsWith('pro_')) {
    return ['Guideline update in my field', 'Explain a tricky case', 'Patient education tips'];
  }
  if (role.startsWith('edu_') || role === 'educator') {
    return ['Create 5 MCQs on a topic', 'Plan a teaching session', 'Design an OSCE station'];
  }
  if (role.startsWith('res_')) {
    return ['Find papers on a topic', 'Critique a study design', 'Sample size calculation'];
  }
  if (role.startsWith('ops_')) {
    return ['Draft an incident report', 'Write a professional memo', 'Explain a medical term simply'];
  }
  return ['Explain the cardiac cycle', 'Quiz me on pharmacology', 'Make this topic simple'];
}

// Home (no chat yet): white fading into soft Aboy green.
const HOME_GRADIENT = ['#ffffff', '#f2faf7', '#d7ece5'] as const;
// During a chat: a different, subtle soft gradient.
const CHAT_GRADIENT = ['#ffffff', '#fbfcfe', '#eef3fa'] as const;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  // ChatGPT-style: the new question pins to the TOP and the answer streams below.
  // A footer spacer (= the empty room needed so the question can reach the top)
  // shrinks GRADUALLY as the answer grows — so there's never a jump when it
  // finishes and never a big void to scroll into. Measured from the last user
  // message's top and the last message's bottom (onLayout in renderItem).
  const lastUserTop = useRef(0);
  const lastBottom = useRef(0);
  const [footerH, setFooterH] = useState(44);
  const sendWindow = useRef(false);

  // Smoothly scroll the latest USER message to the top. We target the message
  // itself (scrollToIndex = a FIXED point), NOT the content end — pinning to the
  // moving end while the answer streams + footer shrinks caused the up/down
  // jitter. The message's position doesn't move, so the view stays rock-steady.
  function scrollQuestionToTop() {
    const msgs = useChatStore.getState().messages;
    let idx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'user') { idx = i; break; } }
    if (idx < 0) return;
    try {
      listRef.current?.scrollToIndex({
        index: idx, viewPosition: 0, viewOffset: insets.top + HEADER_HEIGHT + 10, animated: true,
      });
    } catch {}
  }
  function pinNewMessageToTop() {
    sendWindow.current = true;
    setTimeout(() => { if (sendWindow.current) scrollQuestionToTop(); }, 200);
    setTimeout(() => { sendWindow.current = false; }, 1500);
  }
  const [inputText, setInputText] = useState('');
  // Live research status (Understanding → Searching → Analyzing → Generating).
  // Shown beside the thinking dots until the first answer token streams in.
  const [research, setResearch] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const {
    messages,
    sessionId,
    isLoading,
    setLoading,
    addUserMessage,
    addAssistantMessage,
    setSession,
    startStreaming,
    appendStream,
    finaliseStream,
    setMessageImage,
    setMessageImages,
  } = useChatStore();
  // The currently in-flight request. cancel() works even before the underlying
  // XHR exists (during token fetch), so Stop / a new send can't leave an
  // orphaned stream running in the background.
  const activeReq = useRef<{ cancel: () => void } | null>(null);

  function abortActiveRequest() {
    if (activeReq.current) {
      activeReq.current.cancel();
      activeReq.current = null;
    }
    const streaming = useChatStore.getState().messages.find((m) => m.isStreaming);
    if (streaming) finaliseStream(streaming.id, [], false);
  }
  const { isOffline, enqueueQuery } = useOfflineStore();
  const openPlusSheet = useUIStore((s) => s.openPlusSheet);
  const openVoiceMode = useUIStore((s) => s.openVoiceMode);
  const voiceModeOpen = useUIStore((s) => s.voiceModeOpen);
  const pendingPrompt = useUIStore((s) => s.pendingPrompt);
  const setPendingPrompt = useUIStore((s) => s.setPendingPrompt);
  const pendingImage = useUIStore((s) => s.pendingImage);
  const setPendingImage = useUIStore((s) => s.setPendingImage);
  const pendingFile = useUIStore((s) => s.pendingFile);
  const setPendingFile = useUIStore((s) => s.setPendingFile);
  const analyzeImageToChat = useImageAnalysis();

  // Feature screens (My Project, Cases, …) hand off a prefilled prompt.
  useEffect(() => {
    if (pendingPrompt) {
      setInputText(pendingPrompt);
      setPendingPrompt(null);
    }
  }, [pendingPrompt, setPendingPrompt]);

  // Measured height of the floating input overlay → used as the list's
  // visual-bottom padding so the latest message clears the card (older
  // messages scroll behind it).
  const [barHeight, setBarHeight] = useState(76);

  // Transparency is handled by react-native-edge-to-edge (enforceNavigation
  // BarContrast:false removes the white scrim, content draws behind). Here we
  // only ensure the home/back/overview icons stay dark and visible.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setButtonStyleAsync('dark').catch(() => {});
  }, []);

  // Keyboard state + height. The height is added to the list's bottom padding
  // when the keyboard is open so the newest message lands ABOVE the keyboard/
  // input bar instead of behind it. On open we also re-pin to the bottom if the
  // user was already there.
  const [kbOpen, setKbOpen] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const s = KeyboardEvents.addListener('keyboardDidShow', (e) => {
      setKbOpen(true);
      setKbHeight(e.height ?? 0);
    });
    const hide = KeyboardEvents.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => {
      s.remove();
      hide.remove();
    };
  }, []);

  // Footer height that keeps the latest turn filling the screen (question at the
  // top). Recomputed as the answer grows (onLayout) and when the keyboard/bar
  // change. Bounded so a long answer leaves no empty space, only a small gap.
  function recomputeFooter() {
    const avail = screenHeight - (insets.top + HEADER_HEIGHT + 10) - barHeight - (kbOpen ? kbHeight : 0) - 8;
    const turnH = Math.max(0, lastBottom.current - lastUserTop.current);
    const h = Math.max(8, Math.round(avail - turnH));
    setFooterH((prev) => (Math.abs(prev - h) > 24 ? h : prev));
  }
  useEffect(() => { recomputeFooter(); /* eslint-disable-next-line */ }, [kbOpen, kbHeight, barHeight]);

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? inputText).trim();
    // An attached image/file only applies to a manual send from the input bar
    // (not to voice/regenerate which pass textOverride).
    const image = !textOverride ? pendingImage : null;
    const file = !textOverride ? pendingFile : null;
    if (!text && !image && !file) return;

    // Document attached → extract + explain, using the typed note as the question.
    if (file) {
      setInputText('');
      setPendingFile(null);
      abortActiveRequest();
      addUserMessage(text || `📄 ${file.name}`);
      setLoading(true);
      pinNewMessageToTop();
      try {
        const ans = await analyzeDocument(file.uri, file.name, file.mime, text || undefined);
        addAssistantMessage('doc' + Date.now(), ans || 'I could not read that document.', [], false);
      } catch (e: any) {
        const detail = e?.response?.data?.detail;
        addAssistantMessage('docerr' + Date.now(),
          typeof detail === 'string' ? detail
          : 'Sorry, I could not read that document. Please try a PDF, Word (.docx) or text file with selectable text.',
          [], false);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Image attached → vision flow, using the typed note as the question.
    if (image) {
      setInputText('');
      setPendingImage(null);
      abortActiveRequest();
      pinNewMessageToTop();
      await analyzeImageToChat(image, { prompt: text || undefined, label: text || '🖼️ Explain this image' });
      return;
    }

    setInputText('');

    if (isOffline) {
      addUserMessage(text);
      enqueueQuery(text, sessionId);
      return;
    }

    // A new send always supersedes any in-flight request — cancel it first so
    // two streams can never run at once.
    abortActiveRequest();

    addUserMessage(text);
    useProgressStore.getState().recordQuery(text); // learning progress
    setLoading(true);
    setResearch('Thinking'); // calm initial state until the first status arrives
    // Jump to the bottom so the just-sent message + incoming answer are visible,
    // even if the user had scrolled up.
    pinNewMessageToTop();

    // One continuous thread: include recent turns (typed AND voice).
    // Trim each turn so a long prior answer can't blow the request size /
    // server validation (BUG 1: 2nd question used to fail). Recent context is
    // enough for follow-ups; the backend also trims further.
    const history = useChatStore
      .getState()
      .messages.slice(-10)
      .map((m) => ({ role: m.role, content: (m.content || '').slice(0, 4000) }));

    const aiId = 'ai' + Date.now();
    let started = false;
    let finished = false;
    let cancelled = false;
    let abort: (() => void) | null = null;
    const handle = { cancel: () => { cancelled = true; abort?.(); } };
    activeReq.current = handle;
    const clearIfCurrent = () => { if (activeReq.current === handle) activeReq.current = null; };

    try {
      abort = await streamQuery(text, sessionId, history, {
        onStart: (sid) => {
          if (cancelled) return;
          if (!sessionId) setSession(sid);
        },
        onStatus: (_stage, label) => {
          if (cancelled || started) return;
          setResearch(label); // show the real step Aboy is on right now
        },
        onToken: (chunk) => {
          if (cancelled) return;
          if (!started) {
            started = true;
            // Answer is arriving — stop auto-scrolling so the question stays
            // PARKED at the top; the answer streams into the footer below it
            // (the view no longer drifts down to the input bar).
            sendWindow.current = false;
            setResearch(null); // drop the research panel
            startStreaming(aiId); // first token → swap the thinking dots for the bubble
          }
          appendStream(chunk);
        },
        onImage: (image) => {
          if (cancelled) return;
          setMessageImage(aiId, image);
        },
        onImages: (images) => {
          if (cancelled) return;
          setMessageImages(aiId, images);
        },
        onMeta: (citations, emergency, _sid, auditId) => {
          if (cancelled) return;
          finaliseStream(aiId, citations as any, emergency, auditId);
        },
        onDone: () => {
          if (finished || cancelled) return;
          finished = true;
          if (!started) {
            // No tokens arrived (e.g. empty) — drop the loading state.
            addAssistantMessage('err' + Date.now(), 'No response received. Please try again.', [], false);
          }
          clearIfCurrent();
          setResearch(null);
          setLoading(false);
        },
        onError: (e: any) => {
          if (finished || cancelled) return;
          finished = true;
          const status = e?.response?.status;
          console.warn('[chat] stream failed', { status, code: e?.code });
          let friendly = 'Sorry, I encountered an error. Please try again.';
          if (status === 401) friendly = 'Your session expired. Please sign out and sign in again.';
          else if (status === 429) friendly = 'You’ve hit the daily query limit. Please try again later.';
          else if (status === 503) friendly = 'The AI service is temporarily unavailable. Please try again shortly.';
          else if (e?.code === 'ECONNABORTED') friendly = 'The request timed out. Please try again.';
          if (started) finaliseStream(aiId, [], false);
          else addAssistantMessage('err' + Date.now(), friendly, [], false);
          clearIfCurrent();
          setResearch(null);
          setLoading(false);
        },
      });
      // If Stop (or a new send) fired during the await above, the XHR existed
      // only after this point — abort it now so it can't keep streaming.
      if (cancelled) abort?.();
    } catch (e) {
      if (!cancelled) {
        addAssistantMessage('err' + Date.now(), 'Network error — please check your connection.', [], false);
      }
      clearIfCurrent();
      setResearch(null);
      setLoading(false);
    }
  }

  // Refresh: regenerate an answer by re-asking the question that produced it.
  function regenerate(assistant: { id: string }) {
    if (isLoading) return;
    const msgs = useChatStore.getState().messages;
    const idx = msgs.findIndex((m) => m.id === assistant.id);
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        sendMessage(msgs[i].content);
        return;
      }
    }
  }

  function stopGenerating() {
    // Stop the stream; keep whatever text already arrived. Works even if the
    // request is still in its async setup window (orphan-proof).
    abortActiveRequest();
    setResearch(null);
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

  // Words stream instantly via interim results; continuous mode keeps
  // listening through pauses until the user taps ✓ or ✕.
  useSpeechRecognitionEvent('result', (e: any) => {
    if (!listeningRef.current) return;
    const transcript = e?.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    if (e.isFinal) {
      finalWordsRef.current = (finalWordsRef.current + ' ' + transcript).trim();
      liveWordsRef.current = finalWordsRef.current;
      setLiveWords(finalWordsRef.current);
    } else {
      const combined = (finalWordsRef.current + ' ' + transcript).trim();
      liveWordsRef.current = combined;
      setLiveWords(combined);
    }
  });

  useSpeechRecognitionEvent('volumechange', (e: any) => {
    // e.value ≈ -2..10
    const norm = Math.max(0.08, Math.min(1, ((e?.value ?? 0) + 2) / 12));
    const i = Math.floor(Math.random() * BAR_COUNT);
    Animated.timing(waveLevels[i], { toValue: norm, duration: 100, useNativeDriver: false }).start();
  });

  useSpeechRecognitionEvent('end', () => {
    // Restart if the recognizer stops while the bar is still up.
    if (listeningRef.current) {
      startRecognizer().catch(() => {});
    }
  });

  useSpeechRecognitionEvent('error', (e: any) => {
    // "no-speech" / "speech-timeout" are normal pauses — keep listening.
    if (listeningRef.current && e?.error !== 'no-speech' && e?.error !== 'speech-timeout') {
      console.warn('[stt] error', e?.error, e?.message);
    }
  });

  async function startRecognizer() {
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
    });
  }

  async function beginRecording() {
    finalWordsRef.current = '';
    liveWordsRef.current = '';
    setLiveWords('');
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        console.warn('[stt] permission denied');
        return;
      }
      setIsListening(true);
      listeningRef.current = true;
      await startRecognizer();
    } catch (e) {
      console.warn('[stt] start failed', (e as Error)?.message);
      setIsListening(false);
      listeningRef.current = false;
    }
  }

  async function cancelRecording() {
    setIsListening(false);
    listeningRef.current = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
    setLiveWords('');
    finalWordsRef.current = '';
    liveWordsRef.current = '';
  }

  async function confirmRecording() {
    setIsListening(false);
    listeningRef.current = false;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
    const text = liveWordsRef.current.trim();
    setLiveWords('');
    finalWordsRef.current = '';
    liveWordsRef.current = '';
    if (text) await sendMessage(text); // spoken words sent as a text message
  }

  const hasChat = messages.length > 0;
  const isTyping = inputText.trim().length > 0 || !!pendingImage || !!pendingFile;
  const data = messages; // normal order: oldest -> newest (top -> bottom)
  // Indices we measure (onLayout) to size the footer that keeps the last turn
  // filling the screen: the last user message (its top) and the last item (bottom).
  const lastIndex = data.length - 1;
  let lastUserIndex = -1;
  for (let i = lastIndex; i >= 0; i--) { if (data[i].role === 'user') { lastUserIndex = i; break; } }
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
    <AppScreen withPlusSheet edgeToEdge>
      <LinearGradient
        colors={hasChat ? [...CHAT_GRADIENT] : [...HOME_GRADIENT]}
        locations={[0, 0.5, 1]}
        style={styles.flex}
      >
        {/* No SafeAreaView bottom inset here: when the keyboard is open the
            bar must sit DIRECTLY above it. The safe-area gap is applied to
            the bar itself only while the keyboard is closed. */}
        <View style={styles.flex}>
          <View style={styles.flex}>
            <OfflineBanner />

            {!hasChat ? (
              <View style={[styles.flex, { paddingTop: insets.top + HEADER_HEIGHT }]}>
                <WelcomeHome onPick={(prompt) => sendMessage(prompt)} />
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={data}
                style={styles.flex}
                keyboardShouldPersistTaps="handled"
                // During the brief send window, keep the question pinned to the top
                // (scrollToEnd lands it there because the footer fills the rest).
                onContentSizeChange={() => { if (sendWindow.current) scrollQuestionToTop(); }}
                onScrollToIndexFailed={() => {
                  listRef.current?.scrollToEnd({ animated: false });
                  setTimeout(scrollQuestionToTop, 100);
                }}
                // Thinking dots show only until the first token streams in.
                ListFooterComponent={
                  <>
                    {isLoading && !messages.some((m) => m.isStreaming) ? <ThinkingDots label={research} /> : null}
                    <View style={{ height: footerH }} />
                  </>
                }
                keyExtractor={(m) => m.id}
                contentContainerStyle={[
                  styles.listContent,
                  {
                    paddingTop: insets.top + HEADER_HEIGHT + 10,
                    // Just clear the input bar + keyboard; the footer spacer (above)
                    // does the work of pushing the question to the top.
                    paddingBottom: barHeight + (kbOpen ? kbHeight : 0) + 8,
                  },
                ]}
                renderItem={({ item, index }) => (
                  <View
                    onLayout={
                      index === lastUserIndex || index === lastIndex
                        ? (e) => {
                            const { y, height } = e.nativeEvent.layout;
                            if (index === lastUserIndex) lastUserTop.current = y;
                            if (index === lastIndex) lastBottom.current = y + height;
                            recomputeFooter();
                          }
                        : undefined
                    }
                  >
                    <MessageBubble message={item} onRefresh={regenerate} />
                  </View>
                )}
              />
            )}

            {/* Input OVERLAY — absolutely positioned over the message list so
                conversation scrolls behind the translucent card. Sits flush on
                the keyboard when open (KAV pads the box), clears the safe area
                when closed. */}
            {/* paddingBottom = the gap below the input bar. When the keyboard is
                open it lifts the bar a clear space ABOVE the keyboard (breathing
                room, no collision); when closed it floats above the nav bar. */}
            <KeyboardStickyView
              offset={{ closed: 0, opened: 0 }}
              style={[styles.inputOverlay, { paddingBottom: kbOpen ? 14 : insets.bottom + 8 }]}
              onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
            >
            {/* Attached image preview (waiting for a note + send) */}
            {!voiceModeOpen && !isListening && pendingImage && (
              <View style={styles.attachRow}>
                <View style={styles.attachWrap}>
                  <Image source={{ uri: pendingImage }} style={styles.attachThumb} />
                  <TouchableOpacity
                    style={styles.attachRemove}
                    onPress={() => setPendingImage(null)}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Attached document preview (waiting for a note + send) */}
            {!voiceModeOpen && !isListening && pendingFile && (
              <View style={styles.attachRow}>
                <View style={styles.fileChip}>
                  <MaterialCommunityIcons name="file-document-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.fileChipText} numberOfLines={1}>{pendingFile.name}</Text>
                  <TouchableOpacity onPress={() => setPendingFile(null)} hitSlop={8}>
                    <MaterialCommunityIcons name="close" size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

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
            </KeyboardStickyView>
          </View>
        </View>
      </LinearGradient>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 16 },
  // Floating input overlay — absolute over the conversation. Positioned at the
  // bottom of the KeyboardAvoidingView's padding box, so it rides above the
  // keyboard when open and the home indicator when closed.
  inputOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyLogo: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyLogoLetter: { color: '#fff', fontSize: 36, fontWeight: '800' },
  emptyTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  emptySubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  chipText: { fontSize: 13.5, color: COLORS.text, fontWeight: '500' },

  // Solid WHITE floating card. Everything around it (the wrapper Views and
  // the KeyboardAvoidingView) has no background, so content shows through the
  // transparent space above, below and beside the card — Gemini/Claude style.
  inputCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 12,
    marginTop: 6,
    // Solid white pill — acts as a mask so scrolling messages/dividers can't
    // bleed through and overlap the input. zIndex keeps it above the list.
    backgroundColor: '#FFFFFF',
    zIndex: 99,
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
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
  attachRow: { flexDirection: 'row', paddingHorizontal: 22, marginBottom: 8 },
  attachWrap: { position: 'relative' },
  attachThumb: {
    width: 64, height: 64, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: '#fff',
  },
  attachRemove: {
    position: 'absolute', top: -7, right: -7,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.secondary, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, maxWidth: '85%',
  },
  fileChipText: { flex: 1, fontSize: 13.5, color: COLORS.text, fontWeight: '500' },
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
