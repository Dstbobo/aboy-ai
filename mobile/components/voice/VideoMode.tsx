import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { LiveSession, type LiveStatus } from '@/services/geminiLive';
import { COLORS } from '@/constants/theme';

interface Turn { role: 'user' | 'assistant'; text: string }

export function VideoMode() {
  const insets = useSafeAreaInsets();
  const open = useUIStore((s) => s.videoModeOpen);
  const closeVideoMode = useUIStore((s) => s.closeVideoMode);
  const user = useAuthStore((s) => s.user);
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const frameTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [transcript, setTranscript] = useState<Turn[]>([]);

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

  const startStreaming = useCallback(() => {
    if (frameTimer.current) return;
    // Stream ~1 frame per second to the Live session.
    frameTimer.current = setInterval(async () => {
      try {
        const cam = cameraRef.current;
        const session = sessionRef.current;
        if (!cam || !session) return;
        // animateShutter is disabled on the CameraView; also pass options that
        // avoid the white shutter flash / preview freeze on each capture.
        const photo = await cam.takePictureAsync({
          base64: true,
          quality: 0.3,
          skipProcessing: true,
          shutterSound: false,
        } as any);
        if (photo?.base64) session.sendImageFrame(photo.base64);
      } catch {
        // skip this frame
      }
    }, 2000); // ~1 frame / 2s — smooth preview, still "sees" the page
  }, []);

  const stopStreaming = useCallback(() => {
    if (frameTimer.current) {
      clearInterval(frameTimer.current);
      frameTimer.current = null;
    }
  }, []);

  const handleClose = useCallback(async () => {
    stopStreaming();
    await sessionRef.current?.close();
    sessionRef.current = null;
    setTranscript([]);
    setStatus('connecting');
    closeVideoMode();
  }, [closeVideoMode, stopStreaming]);

  // Open the Live session once the overlay is shown and camera is permitted.
  useEffect(() => {
    if (!open || !permission?.granted) return;
    const session = new LiveSession(user?.id ?? null, {
      onStatus: (s) => {
        setStatus(s);
        if (s === 'connected' || s === 'listening') startStreaming();
      },
      onTranscript: pushTranscript,
    });
    sessionRef.current = session;
    session.connect().catch(() => setStatus('error'));
    return () => {
      stopStreaming();
      session.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, permission?.granted]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcript]);

  if (!open) return null;

  if (!permission?.granted) {
    return (
      <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
        <View style={[styles.permRoot, { paddingTop: insets.top + 40 }]}>
          <MaterialCommunityIcons name="camera-outline" size={56} color={COLORS.primary} />
          <Text style={styles.permTitle}>Camera access</Text>
          <Text style={styles.permBody}>
            Allow camera access to point at textbooks, notes, diagrams or clinical images and talk to Aboy AI about them in real time.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={{ marginTop: 14 }}>
            <Text style={styles.permCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const statusText =
    status === 'connecting' ? 'Connecting…'
    : status === 'reconnecting' ? 'Reconnecting…'
    : status === 'rate_limited' ? 'Busy — retrying…'
    : status === 'speaking' ? 'Speaking…'
    : status === 'error' ? 'Connection error'
    : 'Live — point and talk';

  return (
    <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.root}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          animateShutter={false}
        />

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{statusText}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {transcript.length > 0 && (
          <View style={[styles.panel, { paddingBottom: insets.bottom + 20 }]}>
            <ScrollView ref={scrollRef} style={styles.panelScroll}>
              {transcript.map((t, i) => (
                <Text key={i} style={t.role === 'user' ? styles.userLine : styles.aiLine}>
                  {t.role === 'user' ? 'You: ' : 'Aboy: '}{t.text}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.error },
  liveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '40%',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 18, paddingTop: 14,
  },
  panelScroll: { maxHeight: 200 },
  userLine: { color: '#cfe9e3', fontSize: 14, lineHeight: 21, marginBottom: 4 },
  aiLine: { color: '#fff', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  permRoot: { flex: 1, alignItems: 'center', paddingHorizontal: 32, backgroundColor: '#fff' },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  permBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: 10 },
  permBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 24 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  permCancel: { color: COLORS.textSecondary, fontSize: 15 },
});
