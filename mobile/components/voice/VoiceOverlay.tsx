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
import * as Speech from 'expo-speech';
import { useRecorder } from '@/hooks/useRecorder';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { transcribeAudio } from '@/services/transcribe.service';
import { sendQuery } from '@/services/query.service';
import { COLORS } from '@/constants/theme';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';
interface Turn { role: 'user' | 'assistant'; text: string }

const BAR_COUNT = 28;

export function VoiceOverlay() {
  const insets = useSafeAreaInsets();
  const open = useUIStore((s) => s.voiceModeOpen);
  const closeVoiceMode = useUIStore((s) => s.closeVoiceMode);
  const { start, stop } = useRecorder();
  const { sessionId, setSession, addUserMessage, addAssistantMessage } = useChatStore();

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const levels = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15)),
  ).current;
  const scrollRef = useRef<ScrollView>(null);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const animateBar = useCallback(
    (db: number) => {
      // metering dB is roughly -160 (silent) .. 0 (loud)
      const norm = Math.max(0.08, Math.min(1, (db + 60) / 60));
      const i = Math.floor(Math.random() * BAR_COUNT);
      Animated.timing(levels[i], {
        toValue: norm,
        duration: 120,
        useNativeDriver: false,
      }).start();
    },
    [levels],
  );

  const beginListening = useCallback(async () => {
    setPhase('listening');
    await start(animateBar);
  }, [start, animateBar]);

  const handleStopAndProcess = useCallback(async () => {
    const uri = await stop();
    if (!uri) {
      setPhase('idle');
      return;
    }
    setPhase('thinking');
    try {
      const text = (await transcribeAudio(uri)).trim();
      if (!text) {
        await beginListening();
        return;
      }
      setTranscript((t) => [...t, { role: 'user', text }]);
      addUserMessage(text);

      const result = await sendQuery(text, sessionId);
      if (!sessionId) setSession(result.session_id);
      addAssistantMessage(result.session_id + Date.now(), result.answer, result.citations, result.emergency_triggered);

      const spoken = stripMarkdown(result.answer);
      setTranscript((t) => [...t, { role: 'assistant', text: result.answer }]);
      setPhase('speaking');
      Speech.speak(spoken, {
        rate: 1.0,
        onDone: () => {
          if (phaseRef.current === 'speaking') beginListening();
        },
        onStopped: () => {},
        onError: () => {
          if (phaseRef.current === 'speaking') beginListening();
        },
      });
    } catch {
      setTranscript((t) => [...t, { role: 'assistant', text: 'Sorry, I had trouble with that. Let’s try again.' }]);
      setPhase('idle');
    }
  }, [stop, beginListening, sessionId, setSession, addUserMessage, addAssistantMessage]);

  // Center button behaviour depends on phase
  const onCenterPress = useCallback(() => {
    if (phase === 'listening') {
      handleStopAndProcess();
    } else if (phase === 'speaking') {
      Speech.stop(); // user interrupts the AI
      beginListening();
    } else if (phase === 'idle') {
      beginListening();
    }
  }, [phase, handleStopAndProcess, beginListening]);

  const handleClose = useCallback(async () => {
    Speech.stop();
    await stop();
    setPhase('idle');
    setTranscript([]);
    closeVoiceMode();
  }, [stop, closeVoiceMode]);

  // Auto-start listening when the overlay opens
  useEffect(() => {
    if (open) {
      beginListening();
    }
    return () => {
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcript]);

  const statusText =
    phase === 'listening' ? 'Listening… tap to send'
    : phase === 'thinking' ? 'Thinking…'
    : phase === 'speaking' ? 'Speaking… tap to interrupt'
    : 'Tap to talk';

  const centerIcon =
    phase === 'listening' ? 'stop'
    : phase === 'speaking' ? 'volume-high'
    : phase === 'thinking' ? 'dots-horizontal'
    : 'microphone';

  return (
    <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Voice conversation</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Transcript */}
        <ScrollView ref={scrollRef} style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
          {transcript.length === 0 ? (
            <Text style={styles.hint}>
              Ask a healthcare question out loud. I’ll listen, answer, and speak back.
            </Text>
          ) : (
            transcript.map((turn, i) => (
              <View key={i} style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <Text style={turn.role === 'user' ? styles.userText : styles.aiText}>{turn.text}</Text>
              </View>
            ))
          )}
        </ScrollView>

        {/* Waveform */}
        <View style={styles.waveform}>
          {levels.map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  height: v.interpolate({ inputRange: [0, 1], outputRange: [6, 72] }),
                  opacity: phase === 'listening' ? 1 : 0.35,
                },
              ]}
            />
          ))}
        </View>

        <Text style={styles.status}>{statusText}</Text>

        {/* Center control */}
        <TouchableOpacity
          style={[styles.centerBtn, phase === 'listening' && styles.centerBtnActive]}
          onPress={onCenterPress}
          disabled={phase === 'thinking'}
        >
          <MaterialCommunityIcons name={centerIcon as any} size={40} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function stripMarkdown(md: string): string {
  return md
    .replace(/[#*_`>~]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  aiText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    gap: 4,
    marginVertical: 8,
  },
  bar: { width: 5, borderRadius: 3, backgroundColor: '#fff' },
  status: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontSize: 14, marginBottom: 14 },
  centerBtn: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtnActive: { backgroundColor: COLORS.error },
});
