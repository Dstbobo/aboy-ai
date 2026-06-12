import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Alert,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { LiveSession, type LiveStatus } from '@/services/geminiLive';
import { COLORS } from '@/constants/theme';

export function VoiceOverlay() {
  const insets = useSafeAreaInsets();
  const open = useUIStore((s) => s.voiceModeOpen);
  const closeVoiceMode = useUIStore((s) => s.closeVoiceMode);
  const user = useAuthStore((s) => s.user);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [aiText, setAiText] = useState('');
  const [userText, setUserText] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  const sessionRef = useRef<LiveSession | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const frameTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiScrollRef = useRef<ScrollView>(null);

  // Pulsing pill animation — runs the whole time audio is active.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!open) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [open, pulse]);

  const onTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    if (role === 'assistant') {
      setAiText((prev) => (prev + ' ' + text).trim());
      setUserText('');
    } else {
      setUserText((prev) => (prev + ' ' + text).trim());
      // New user turn — clear previous AI answer so the screen stays clean.
      setAiText((prev) => (prev ? '' : prev));
    }
  }, []);

  // ── Session lifecycle ──
  useEffect(() => {
    if (!open) return;
    const session = new LiveSession(user?.id ?? null, {
      onStatus: setStatus,
      onTranscript,
    });
    sessionRef.current = session;
    session.connect().catch(() => setStatus('error'));
    return () => {
      stopFrames();
      session.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    aiScrollRef.current?.scrollToEnd({ animated: true });
  }, [aiText]);

  // ── Camera frame streaming (1 FPS, 480px) ──
  const stopFrames = useCallback(() => {
    if (frameTimer.current) {
      clearInterval(frameTimer.current);
      frameTimer.current = null;
    }
  }, []);

  const startFrames = useCallback(() => {
    if (frameTimer.current) return;
    frameTimer.current = setInterval(async () => {
      try {
        const cam = cameraRef.current;
        const session = sessionRef.current;
        if (!cam || !session || !session.isReady) return;
        const photo = await cam.takePictureAsync({ base64: false, quality: 0.4, skipProcessing: true, shutterSound: false } as any);
        if (!photo?.uri) return;
        const scaled = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 480 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (scaled.base64) session.sendImageFrame(scaled.base64);
      } catch {
        /* skip frame */
      }
    }, 1000);
  }, []);

  async function toggleCamera() {
    if (cameraOn) {
      stopFrames();
      setCameraOn(false);
      return;
    }
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
    // frames start once the CameraView mounts; small delay for readiness
    setTimeout(startFrames, 800);
  }

  function toggleMute() {
    const next = !micMuted;
    setMicMuted(next);
    sessionRef.current?.setMicMuted(next);
  }

  const handleClose = useCallback(async () => {
    stopFrames();
    await sessionRef.current?.close();
    sessionRef.current = null;
    setAiText('');
    setUserText('');
    setMicMuted(false);
    setCameraOn(false);
    setStatus('connecting');
    closeVoiceMode();
  }, [closeVoiceMode, stopFrames]);

  function onPillPress() {
    // Tap the pill to interrupt the AI while it is speaking.
    if (status === 'speaking') sessionRef.current?.interrupt();
  }

  const firstName = (user?.fullName || '').split(' ')[0] || 'there';
  const aiSpeaking = status === 'speaking';
  const statusLine =
    status === 'connecting' || status === 'connected' ? 'Connecting…'
    : status === 'reconnecting' ? 'Reconnecting…'
    : status === 'rate_limited' ? 'Busy — retrying…'
    : status === 'error' ? 'Connection error'
    : micMuted ? 'Mic muted'
    : aiSpeaking ? 'Speaking — tap the pill to interrupt'
    : 'Listening…';

  return (
    <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
      <LinearGradient colors={['#ffffff', '#ffffff', '#dcebf7']} locations={[0, 0.45, 1]} style={styles.root}>
        {/* Optional camera preview layer */}
        {cameraOn && (
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />
            <View style={styles.cameraBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.cameraBadgeText}>Camera live</Text>
            </View>
          </View>
        )}

        <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
          {/* Center: logo + greeting or live AI text */}
          {aiText ? (
            <ScrollView ref={aiScrollRef} style={styles.aiScroll} contentContainerStyle={styles.aiScrollContent}>
              <Text style={styles.aiSpeech}>{aiText}</Text>
            </ScrollView>
          ) : (
            <View style={styles.centerBlock}>
              <View style={styles.logo}>
                <Text style={styles.logoLetter}>A</Text>
              </View>
              <Text style={styles.greeting}>How can I help, {firstName}?</Text>
              <Text style={styles.statusLine}>{statusLine}</Text>
            </View>
          )}

          {/* User live words — grey bubble above the controls */}
          <View style={styles.bottomArea}>
            {!!userText && (
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{userText}</Text>
              </View>
            )}
            {!!aiText && <Text style={styles.statusLineSmall}>{statusLine}</Text>}

            {/* Bottom control bar — 5 buttons */}
            <View style={[styles.controls, { marginBottom: insets.bottom + 14 }]}>
              <TouchableOpacity
                style={[styles.sideBtn, cameraOn && styles.sideBtnActive]}
                onPress={toggleCamera}
              >
                <MaterialCommunityIcons name={cameraOn ? 'camera' : 'camera-outline'} size={24} color={cameraOn ? '#fff' : COLORS.text} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sideBtn}
                onPress={() => Alert.alert('Upload', 'File upload in voice mode is coming soon.')}
              >
                <MaterialCommunityIcons name="plus" size={24} color={COLORS.text} />
              </TouchableOpacity>

              {/* Center pill */}
              <TouchableOpacity activeOpacity={0.8} onPress={onPillPress}>
                <Animated.View
                  style={[
                    styles.pill,
                    { transform: [{ scale: pulse }] },
                    aiSpeaking && styles.pillSpeaking,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={aiSpeaking ? 'volume-high' : 'waveform'}
                    size={26}
                    color={aiSpeaking ? '#fff' : COLORS.primary}
                  />
                </Animated.View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sideBtn, micMuted && styles.sideBtnMuted]}
                onPress={toggleMute}
              >
                <MaterialCommunityIcons name={micMuted ? 'microphone-off' : 'microphone'} size={24} color={micMuted ? '#fff' : COLORS.text} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.sideBtn} onPress={handleClose}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, justifyContent: 'space-between' },

  cameraWrap: {
    position: 'absolute',
    top: 90,
    right: 16,
    width: 120,
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 5,
    borderWidth: 2,
    borderColor: 'rgba(10,95,82,0.4)',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cameraBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '600' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.error },

  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  logoLetter: { color: '#fff', fontSize: 40, fontWeight: '800' },
  greeting: { fontSize: 26, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  statusLine: { fontSize: 15, color: COLORS.textSecondary, marginTop: 12 },
  statusLineSmall: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 10 },

  aiScroll: { flex: 1, marginTop: 40 },
  aiScrollContent: { paddingHorizontal: 26, paddingBottom: 16 },
  aiSpeech: { fontSize: 24, lineHeight: 34, color: COLORS.text, fontWeight: '500' },

  bottomArea: { paddingHorizontal: 16 },
  userBubble: {
    alignSelf: 'center',
    backgroundColor: '#ECEDEF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 14,
    maxWidth: '92%',
  },
  userBubbleText: { fontSize: 15, color: '#3a3f45', lineHeight: 21 },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sideBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  sideBtnActive: { backgroundColor: COLORS.primary },
  sideBtnMuted: { backgroundColor: COLORS.error },
  pill: {
    width: 96, height: 56, borderRadius: 28,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    borderWidth: 1, borderColor: COLORS.border,
  },
  pillSpeaking: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryLight,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.6,
  },
});
