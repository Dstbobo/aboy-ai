import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import type { Message } from '@/stores/chat.store';
import { CitationCard } from './CitationCard';
import { StreamingText } from './StreamingText';
import { EmergencyBanner } from './EmergencyBanner';
import { COLORS } from '@/constants/theme';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.userContainer}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  // AI responses render full width directly on the background —
  // no box, no border, no shadow (Claude.ai style).
  return (
    <View style={styles.aiContainer}>
      {message.emergency_triggered && <EmergencyBanner />}
      <StreamingText content={message.content} isStreaming={message.isStreaming} />
      {message.citations.length > 0 && <CitationCard citations={message.citations} />}
    </View>
  );
}

const styles = StyleSheet.create({
  userContainer: { marginVertical: 6, alignSelf: 'flex-end', maxWidth: '88%' },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  aiContainer: { marginVertical: 8, alignSelf: 'stretch', width: '100%' },
});
