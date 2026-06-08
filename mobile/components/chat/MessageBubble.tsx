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

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {message.emergency_triggered && !isUser && (
        <EmergencyBanner />
      )}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : (
          <StreamingText content={message.content} isStreaming={message.isStreaming} />
        )}
        {!isUser && message.citations.length > 0 && (
          <CitationCard citations={message.citations} />
        )}
      </View>
      <Text style={styles.timestamp}>
        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 4, maxWidth: '92%' },
  userContainer: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  aiContainer: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 16, padding: 12, elevation: 1 },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  timestamp: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginHorizontal: 4,
  },
});
