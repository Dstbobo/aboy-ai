import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { COLORS } from '@/constants/theme';

export function PlusSheet() {
  const insets = useSafeAreaInsets();
  const { plusSheetOpen, closePlusSheet, webSearchEnabled, toggleWebSearch } = useUIStore();
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const addAssistantMessage = useChatStore((s) => s.addAssistantMessage);

  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  function comingSoon(feature: string) {
    closePlusSheet();
    Alert.alert(feature, `${feature} attachments are coming soon.`);
  }

  // ── Voice (hold-free): tap to start, tap again to stop & send ──
  async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Please allow microphone access to record voice questions.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }

  async function stopRecording() {
    const recording = recordingRef.current;
    setIsRecording(false);
    recordingRef.current = null;
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      if (uri) {
        addUserMessage('🎤 Voice message');
        addAssistantMessage(
          'voice' + Date.now(),
          'I received your voice message. Voice transcription is coming soon — please type your question for now and I’ll answer with cited sources.',
          [],
          false,
        );
      }
    } catch {
      // recording already torn down
    } finally {
      closePlusSheet();
    }
  }

  function onVoicePress() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  return (
    <Modal
      visible={plusSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={closePlusSheet}
    >
      <Pressable style={styles.backdrop} onPress={isRecording ? undefined : closePlusSheet}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <TouchableOpacity style={styles.row} onPress={() => comingSoon('Camera')}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.rowLabel}>Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => comingSoon('Photos')}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="image-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.rowLabel}>Photos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => comingSoon('Files')}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="file-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.rowLabel}>Files</Text>
          </TouchableOpacity>

          {/* Voice message */}
          <TouchableOpacity style={styles.row} onPress={onVoicePress}>
            <View style={[styles.iconWrap, isRecording && styles.iconWrapRec]}>
              <MaterialCommunityIcons
                name={isRecording ? 'stop' : 'microphone-outline'}
                size={22}
                color={isRecording ? '#fff' : COLORS.primary}
              />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.rowLabel}>{isRecording ? 'Stop & send' : 'Voice message'}</Text>
              <Text style={styles.rowSub}>
                {isRecording ? 'Recording… tap to finish' : 'Record a spoken question'}
              </Text>
            </View>
            {isRecording && <View style={styles.recDot} />}
          </TouchableOpacity>

          {/* Web search toggle */}
          <View style={[styles.row, styles.rowToggle]}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="web" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.rowLabel}>Web search</Text>
              <Text style={styles.rowSub}>Include live sources in answers</Text>
            </View>
            <Switch
              value={webSearchEnabled}
              onValueChange={toggleWebSearch}
              trackColor={{ true: COLORS.primary, false: COLORS.border }}
              thumbColor="#fff"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  rowToggle: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, marginTop: 4 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapRec: { backgroundColor: COLORS.error },
  rowLabel: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  rowSub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 1 },
  toggleText: { flex: 1 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.error },
});
