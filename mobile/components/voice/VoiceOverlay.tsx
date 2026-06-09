import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { LiveSession, type LiveStatus } from '@/services/geminiLive';
import { COLORS } from '@/constants/theme';

interface Turn { role: 'user' | 'assistant'; text: string }
const BAR_COUNT = 28;

export function VoiceOverlay() {
  const insets = useSafeAreaInsets();
  const open = useUIStore((s) => s.voiceModeOpen);
  const closeVoiceMode = useUIStore((s) => s.closeVoiceMode);
  const user = useAuthStore((s) => s.user);

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const levels = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15)),
  ).current;

  const pushTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        const copy = prev.slice();
        copy[copy.length - 1] = { role, text: (last.text + ' ' + text).trim() };
        return copy;
      }
      return [...prev, { role, text }];
    });
  }, []);

  const animateLevel = useCallback(
    (level: number) => {
      const i = Math.floor(Math.random() * BAR_COUNT);
      Animated.timing(levels[i], {
        toValue: Math.max(0.1, Math.min(1, level)),
        duration: 120,
        useNativeDriver: false,
      }).start();
    },
    [levels],
  );

  useEffect(() => {
    if (!open) return;
    const session = new LiveSession(user?.id ?? null, {
      onStatus: setStatus,
      onTranscript: pushTranscript,
      onLevel: animateLevel,
    });
    sessionRef.current = session;
    session.connect().catch(() => setStatus('error'));
    return () => {
      session.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcript]);

  const handleClose = useCallback(async () => {
    await sessionRef.current?.close();
    sessionRef.current = null;
    setTranscript([]);
    setStatus('connecting');
    closeVoiceMode();
  }, [closeVoiceMode]);

  const onCenterPress = useCallback(() => {
    // Tap to interrupt while the AI is speaking.
    if (status === 'speaking') sessionRef.current?.interrupt();
  }, [status]);

  const notConfigured = !sessionRef.current?.isConfigured && status === 'error';

  const statusText =
    notConfigured ? 'Voice service not configured'
    : status === 'connecting' ? 'Connecting…'
    : status === 'reconnecting' ? 'Reconnecting…'
    : status === 'rate_limited' ? 'Busy — retrying…'
    : status === 'speaking' ? 'Speaking… tap to interrupt'
    : status === 'error' ? 'Connection error'
    : 'Listening…';

  const centerIcon =
    status === 'speaking' ? 'volume-high'
    : status === 'connecting' || status === 'reconnecting' ? 'dots-horizontal'
    : status === 'error' ? 'alert-circle-outline'
    : 'microphone';

  return (
    <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Voice conversation</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
          {transcript.length === 0 ? (
            <Text style={styles.hint}>
              {notConfigured
                ? 'Set EXPO_PUBLIC_GEMINI_LIVE_URL to your deployed Live proxy to enable realtime voice.'
                : 'Start talking. I’ll listen and answer out loud, in real time.'}
            </Text>
          ) : (
            transcript.map((turn, i) => (
              <View key={i} style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <Text style={styles.bubbleText}>{turn.text}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.waveform}>
          {levels.map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  height: v.interpolate({ inputRange: [0, 1], outputRange: [6, 72] }),
                  opacity: status === 'listening' || status === 'speaking' ? 1 : 0.35,
                },
              ]}
            />
          ))}
        </View>

        <Text style={styles.status}>{statusText}</Text>

        <TouchableOpacity
          style={[styles.centerBtn, status === 'speaking' && styles.centerBtnActive]}
          onPress={onCenterPress}
        >
          <MaterialCommunityIcons name={centerIcon as any} size={40} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.primaryDark, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  transcript: { flex: 1, marginTop: 12 },
  transcriptContent: { paddingVertical: 8, gap: 10 },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 15, textAlign: 'center', marginTop: 40, lineHeight: 22 },
  bubble: { maxWidth: '90%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.primaryLight },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)' },
  bubbleText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  waveform: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 80, gap: 4, marginVertical: 8 },
  bar: { width: 5, borderRadius: 3, backgroundColor: '#fff' },
  status: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontSize: 14, marginBottom: 14 },
  centerBtn: {
    alignSelf: 'center', width: 84, height: 84, borderRadius: 42,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  centerBtnActive: { backgroundColor: COLORS.error },
});
