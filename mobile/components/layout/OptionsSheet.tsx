import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { COLORS } from '@/constants/theme';

/** Three-dot menu — clean white bottom sheet, icon left / label right. */
export function OptionsSheet() {
  const insets = useSafeAreaInsets();
  const { optionsSheetOpen, closeOptionsSheet } = useUIStore();
  const clearChat = useChatStore((s) => s.clearChat);
  const router = useRouter();

  function run(action: () => void) {
    closeOptionsSheet();
    action();
  }

  const items = [
    {
      icon: 'chat-plus-outline',
      label: 'New chat',
      onPress: () =>
        run(() => {
          clearChat();
          router.replace('/(clinical)/chat');
        }),
    },
    {
      icon: 'pin-outline',
      label: 'Pin',
      onPress: () => run(() => Alert.alert('Pin', 'Pinned chats are coming soon.')),
    },
    {
      icon: 'pencil-outline',
      label: 'Rename',
      onPress: () => run(() => Alert.alert('Rename', 'Chat renaming is coming soon.')),
    },
    {
      icon: 'help-circle-outline',
      label: 'Help',
      onPress: () =>
        run(() =>
          Alert.alert(
            'Help',
            'Ask any healthcare or study question in chat. Tap the pill to talk by voice. Answers cite verified sources.',
          ),
        ),
    },
    {
      icon: 'message-alert-outline',
      label: 'Feedback',
      onPress: () =>
        run(() => Linking.openURL('mailto:daniel11dst@gmail.com?subject=Aboy%20AI%20Feedback')),
    },
    {
      icon: 'trash-can-outline',
      label: 'Delete',
      destructive: true,
      onPress: () =>
        run(() =>
          Alert.alert('Delete chat', 'This clears the current conversation. Continue?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => clearChat() },
          ]),
        ),
    },
  ];

  return (
    <Modal
      visible={optionsSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={closeOptionsSheet}
    >
      <Pressable style={styles.backdrop} onPress={closeOptionsSheet}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          {items.map((item) => (
            <TouchableOpacity key={item.label} style={styles.row} onPress={item.onPress}>
              <MaterialCommunityIcons
                name={item.icon as any}
                size={22}
                color={item.destructive ? COLORS.error : COLORS.text}
              />
              <Text style={[styles.label, item.destructive && { color: COLORS.error }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  label: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
});
