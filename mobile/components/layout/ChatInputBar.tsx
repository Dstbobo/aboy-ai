import React from 'react';
import {
  View,
  StyleSheet,
  TextInput as RNTextInput,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore } from '@/stores/ui.store';
import { COLORS } from '@/constants/theme';

interface ChatInputBarProps {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function ChatInputBar({ value, onChangeText, onSend, disabled }: ChatInputBarProps) {
  const insets = useSafeAreaInsets();
  const openPlusSheet = useUIStore((s) => s.openPlusSheet);
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 6 }]}>
      <View style={styles.bar}>
        {/* + button */}
        <TouchableOpacity style={styles.plusBtn} onPress={openPlusSheet} hitSlop={6}>
          <MaterialCommunityIcons name="plus" size={24} color={COLORS.text} />
        </TouchableOpacity>

        {/* Text input */}
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Ask a healthcare question..."
          placeholderTextColor={COLORS.textSecondary}
          style={styles.input}
          multiline
          maxLength={2000}
        />

        {/* Send */}
        <TouchableOpacity
          style={[styles.sendBtn, canSend ? styles.sendOn : styles.sendOff]}
          onPress={onSend}
          disabled={!canSend}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="arrow-up" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  plusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOn: { backgroundColor: COLORS.primary },
  sendOff: { backgroundColor: COLORS.border },
});
