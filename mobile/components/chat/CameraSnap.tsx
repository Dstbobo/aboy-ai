import React, { useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useUIStore } from '@/stores/ui.store';
import { COLORS } from '@/constants/theme';

/**
 * Snap a photo (textbook page, diagram, ECG, notes, clinical image) and get a
 * cited explanation in the chat. Reuses the existing /api/v1/vision (Gemini)
 * backend. Flow: capture → preview (retake / ask) → analyze → push to chat.
 */
export function CameraSnap() {
  const insets = useSafeAreaInsets();
  const open = useUIStore((s) => s.cameraSnapOpen);
  const close = useUIStore((s) => s.closeCameraSnap);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [shot, setShot] = useState<string | null>(null); // captured image uri
  const setPendingImage = useUIStore((s) => s.setPendingImage);

  const reset = useCallback(() => {
    setShot(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    close();
  }, [reset, close]);

  const capture = useCallback(async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
        shutterSound: false,
      } as any);
      if (photo?.uri) setShot(photo.uri);
    } catch {
      // ignore — user can tap again
    }
  }, []);

  // Attach the captured photo to the input bar so the user can add a note/
  // question before sending. The chat send handles the actual vision call.
  const usePhoto = useCallback(() => {
    if (!shot) return;
    setPendingImage(shot);
    handleClose();
  }, [shot, setPendingImage, handleClose]);

  if (!open) return null;

  // ── Camera permission gate ──
  if (!permission?.granted) {
    return (
      <Modal visible={open} animationType="slide" onRequestClose={handleClose}>
        <View style={[styles.permRoot, { paddingTop: insets.top + 40 }]}>
          <MaterialCommunityIcons name="camera-outline" size={56} color={COLORS.primary} />
          <Text style={styles.permTitle}>Camera access</Text>
          <Text style={styles.permBody}>
            Allow camera access to snap a textbook page, diagram, ECG, notes or clinical
            image and get a clear explanation from Aboy AI.
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
        {shot ? (
          // ── Preview: retake or ask ──
          <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />
        )}

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.topText}>{shot ? 'Use this photo?' : 'Snap a page, diagram or image'}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Bottom controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}>
          {shot ? (
            <View style={styles.previewRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={reset}>
                <MaterialCommunityIcons name="camera-retake-outline" size={22} color="#fff" />
                <Text style={styles.secondaryText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={usePhoto}>
                <MaterialCommunityIcons name="check" size={20} color="#fff" />
                <Text style={styles.primaryText}>Use photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.shutter} onPress={capture}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          )}
        </View>
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
  topText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  controls: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', paddingTop: 16,
  },
  shutter: {
    width: 74, height: 74, borderRadius: 37,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  previewRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 24 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 28,
    paddingVertical: 14, paddingHorizontal: 22,
  },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 28,
    paddingVertical: 14, paddingHorizontal: 28, minWidth: 150, justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  permRoot: { flex: 1, alignItems: 'center', paddingHorizontal: 32, backgroundColor: '#fff' },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  permBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: 10 },
  permBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 24 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  permCancel: { color: COLORS.textSecondary, fontSize: 15 },
});
