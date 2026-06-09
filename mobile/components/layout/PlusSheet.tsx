import React from 'react';
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
import { useUIStore } from '@/stores/ui.store';
import { COLORS } from '@/constants/theme';

export function PlusSheet() {
  const insets = useSafeAreaInsets();
  const {
    plusSheetOpen,
    closePlusSheet,
    webSearchEnabled,
    toggleWebSearch,
    openVoiceMode,
    openVideoMode,
  } = useUIStore();

  function comingSoon(feature: string) {
    closePlusSheet();
    Alert.alert(feature, `${feature} attachments are coming soon.`);
  }

  return (
    <Modal
      visible={plusSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={closePlusSheet}
    >
      <Pressable style={styles.backdrop} onPress={closePlusSheet}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          {/* Camera / Video study mode (Gemini vision) */}
          <TouchableOpacity style={styles.row} onPress={openVideoMode}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.rowLabel}>Camera</Text>
              <Text style={styles.rowSub}>Point at a textbook, notes, or image to ask</Text>
            </View>
          </TouchableOpacity>

          {/* Voice conversation (full duplex turn-based) */}
          <TouchableOpacity style={styles.row} onPress={openVoiceMode}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="waveform" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.rowLabel}>Voice conversation</Text>
              <Text style={styles.rowSub}>Talk back and forth, hands-free</Text>
            </View>
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

          {/* Web search toggle */}
          <View style={[styles.row, styles.rowToggle]}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="web" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.textWrap}>
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
  textWrap: { flex: 1 },
  rowLabel: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  rowSub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 1 },
});
