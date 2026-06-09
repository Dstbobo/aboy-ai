import React, { useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { useUIStore } from '@/stores/ui.store';
import { analyzeImage } from '@/services/vision.service';
import { COLORS } from '@/constants/theme';

type Phase = 'ready' | 'analyzing' | 'answered';

export function VideoMode() {
  const insets = useSafeAreaInsets();
  const open = useUIStore((s) => s.videoModeOpen);
  const closeVideoMode = useUIStore((s) => s.closeVideoMode);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('ready');
  const [answer, setAnswer] = useState('');

  const handleClose = useCallback(() => {
    Speech.stop();
    setPhase('ready');
    setAnswer('');
    closeVideoMode();
  }, [closeVideoMode]);

  const capture = useCallback(async () => {
    if (!cameraRef.current || phase === 'analyzing') return;
    try {
      setPhase('analyzing');
      setAnswer('');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: true });
      if (!photo?.uri) {
        setPhase('ready');
        return;
      }
      const text = await analyzeImage(photo.uri);
      setAnswer(text);
      setPhase('answered');
      Speech.speak(stripMarkdown(text), { rate: 1.0 });
    } catch {
      setAnswer('Sorry, I could not analyze that image. Please try again.');
      setPhase('answered');
    }
  }, [phase]);

  if (!open) return null;

  // Ask for camera permission if needed
  if (!permission?.granted) {
    return (
      <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
        <View style={[styles.permRoot, { paddingTop: insets.top + 40 }]}>
          <MaterialCommunityIcons name="camera-outline" size={56} color={COLORS.primary} />
          <Text style={styles.permTitle}>Camera access</Text>
          <Text style={styles.permBody}>
            Allow camera access to point at textbooks, notes, diagrams or clinical images and ask Aboy AI about them.
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

  return (
    <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.root}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.topTitle}>Study with camera</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Answer panel */}
        {(phase === 'answered' || phase === 'analyzing') && (
          <View style={[styles.answerPanel, { paddingBottom: insets.bottom + 90 }]}>
            {phase === 'analyzing' ? (
              <View style={styles.analyzingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.analyzingText}>Looking…</Text>
              </View>
            ) : (
              <ScrollView style={styles.answerScroll}>
                <Text style={styles.answerText}>{answer}</Text>
              </ScrollView>
            )}
          </View>
        )}

        {/* Capture button */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[styles.captureBtn, phase === 'analyzing' && styles.captureBtnDisabled]}
            onPress={capture}
            disabled={phase === 'analyzing'}
          >
            <MaterialCommunityIcons name="camera" size={30} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.hint}>Point at a page or image and tap to ask</Text>
        </View>
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
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  answerPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: '55%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 18, paddingTop: 16,
  },
  answerScroll: { maxHeight: 240 },
  answerText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  analyzingText: { color: '#fff', fontSize: 15 },
  controls: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    alignItems: 'center', gap: 8, paddingTop: 12,
  },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)',
  },
  captureBtnDisabled: { opacity: 0.6 },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  permRoot: { flex: 1, alignItems: 'center', paddingHorizontal: 32, backgroundColor: '#fff' },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  permBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: 10 },
  permBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 24 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  permCancel: { color: COLORS.textSecondary, fontSize: 15 },
});
