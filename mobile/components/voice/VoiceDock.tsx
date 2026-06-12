import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { LiveSession, type LiveStatus } from '@/services/geminiLive';
import { COLORS } from '@/constants/theme';

/**
 * Inline voice conversation dock — lives INSIDE the chat screen, replacing the
 * input bar while voice is active. The conversation stays visible above it.
 * Controls: camera (opens full-screen camera mode) | live captions |
 * pulsing pill (glows while AI speaks, tap to interrupt) | mute | close.
 */
export function VoiceDock() {
  const closeVoiceMode = useUIStore((s) => s.closeVoiceMode);
  const openVideoMode = useUIStore((s) => s.openVideoMode);
  const videoModeOpen = useUIStore((s) => s.videoModeOpen);
  const user = useAuthStore((s) => s.user);
  const { addUserMessage, addAssistantMessage } = useChatStore();

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [userCaption, setUserCaption] = useState('');
  const [aiCaption, setAiCaption] = useState('');
  const [micMuted, setMicMuted] = useState(false);

  const sessionRef = useRef<LiveSession | null>(null);
  const userTurnRef = useRef('');
  const aiTurnRef = useRef('');

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const onTranscript = useCallback(
    (role: 'user' | 'assistant', text: string) => {
      if (role === 'user') {
        userTurnRef.current = (userTurnRef.current + ' ' + text).trim();
        setUserCaption(userTurnRef.current);
        // A new user turn after the AI finished — persist the AI's turn to chat.
        if (aiTurnRef.current) {
          addAssistantMessage('live' + Date.now(), aiTurnRef.current, [], false);
          aiTurnRef.current = '';
          setAiCaption('');
        }
      } else {
        aiTurnRef.current = (aiTurnRef.current + ' ' + text).trim();
        setAiCaption(aiTurnRef.current);
        // AI started replying — persist what the user said into the chat.
        if (userTurnRef.current) {
          addUserMessage(userTurnRef.current);
          userTurnRef.current = '';
          setUserCaption('');
        }
      }
    },
    [addAssistantMessage, addUserMessage],
  );

  // Run the session only while the dock is active and the full-screen camera
  // is closed (camera mode runs its own Live session — avoids two open mics).
  useEffect(() => {
    if (videoModeOpen) return;
    const session = new LiveSession(user?.id ?? null, {
      onStatus: setStatus,
      onTranscript,
    });
    sessionRef.current = session;
    session.connect().catch(() => setStatus('error'));
    return () => {
      // Flush any unfinished AI turn into the chat before tearing down.
      if (aiTurnRef.current) {
        addAssistantMessage('live' + Date.now(), aiTurnRef.current, [], false);
        aiTurnRef.current = '';
      }
      session.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoModeOpen]);

  function toggleMute() {
    const next = !micMuted;
    setMicMuted(next);
    sessionRef.current?.setMicMuted(next);
  }

  function onPillPress() {
    if (status === 'speaking') sessionRef.current?.interrupt();
  }

  const aiSpeaking = status === 'speaking';
  const statusText =
    status === 'connecting' || status === 'connected' ? 'Connecting…'
    : status === 'reconnecting' ? 'Reconnecting…'
    : status === 'rate_limited' ? 'Busy — retrying…'
    : status === 'error' ? 'Connection error — tap ✕ and retry'
    : micMuted ? 'Mic muted'
    : aiSpeaking ? 'Speaking — tap pill to interrupt'
    : 'Listening…';

  return (
    <View style={styles.wrap}>
      {/* Live captions floating above the dock */}
      {!!aiCaption && (
        <Text style={styles.aiCaption} numberOfLines={4}>
          {aiCaption}
        </Text>
      )}
      {!!userCaption && (
        <View style={styles.userBubble}>
          <Text style={styles.userBubbleText} numberOfLines={3}>
            {userCaption}
          </Text>
        </View>
      )}
      <Text style={styles.status}>{statusText}</Text>

      {/* Voice controls bar (replaces the input bar) */}
      <View style={styles.bar}>
        <TouchableOpacity style={styles.sideBtn} onPress={openVideoMode} hitSlop={6}>
          <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} onPress={onPillPress}>
          <Animated.View
            style={[styles.pill, { transform: [{ scale: pulse }] }, aiSpeaking && styles.pillSpeaking]}
          >
            <MaterialCommunityIcons
              name={aiSpeaking ? 'volume-high' : 'waveform'}
              size={24}
              color={aiSpeaking ? '#fff' : COLORS.primary}
            />
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sideBtn, micMuted && styles.sideBtnMuted]}
          onPress={toggleMute}
          hitSlop={6}
        >
          <MaterialCommunityIcons
            name={micMuted ? 'microphone-off' : 'microphone'}
            size={22}
            color={micMuted ? '#fff' : COLORS.text}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.sideBtn} onPress={closeVoiceMode} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 10 },
  aiCaption: {
    fontSize: 17,
    lineHeight: 25,
    color: COLORS.text,
    fontWeight: '500',
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'center',
    backgroundColor: '#ECEDEF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
    maxWidth: '94%',
  },
  userBubbleText: { fontSize: 14.5, color: '#3a3f45', lineHeight: 20 },
  status: { fontSize: 12.5, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 9,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
  sideBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#F1F1F3',
    alignItems: 'center', justifyContent: 'center',
  },
  sideBtnMuted: { backgroundColor: COLORS.error },
  pill: {
    width: 84, height: 46, borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COLORS.secondary,
    elevation: 5,
    shadowColor: COLORS.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  pillSpeaking: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight },
});
