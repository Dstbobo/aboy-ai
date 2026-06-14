import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import type { Message } from '@/stores/chat.store';
import { useChatStore } from '@/stores/chat.store';
import { rateAnswer } from '@/services/usage.service';
import { CitationCard } from './CitationCard';
import { StreamingText } from './StreamingText';
import { EmergencyBanner } from './EmergencyBanner';
import { COLORS } from '@/constants/theme';

interface Props {
  message: Message;
  onRefresh?: (message: Message) => void;
}

function stripMarkdown(md: string): string {
  return md.replace(/[#*_`>~|]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

export function MessageBubble({ message, onRefresh }: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  if (isUser) {
    return (
      <View style={styles.userContainer}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  async function copy() {
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function share() {
    try {
      await Share.share({ message: message.content });
    } catch {}
  }

  function togglePlay() {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      Speech.speak(stripMarkdown(message.content), {
        rate: 1.0,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    }
  }

  async function rate(dir: 'up' | 'down') {
    setVote(dir);
    const sid = useChatStore.getState().sessionId;
    if (sid) rateAnswer(sid, dir).catch(() => {});
  }

  // AI responses render full width on the background (Claude.ai style).
  return (
    <View style={styles.aiContainer}>
      {message.emergency_triggered && <EmergencyBanner />}
      <StreamingText content={message.content} isStreaming={message.isStreaming} />
      {message.citations.length > 0 && <CitationCard citations={message.citations} />}

      {!message.isStreaming && message.content.length > 0 && (
        <View style={styles.actions}>
          <Action icon={copied ? 'check' : 'content-copy'} active={copied} onPress={copy} />
          <Action icon="share-variant-outline" onPress={share} />
          <Action icon={speaking ? 'stop' : 'volume-high'} active={speaking} onPress={togglePlay} />
          <Action icon={vote === 'up' ? 'thumb-up' : 'thumb-up-outline'} active={vote === 'up'} onPress={() => rate('up')} />
          <Action icon={vote === 'down' ? 'thumb-down' : 'thumb-down-outline'} active={vote === 'down'} onPress={() => rate('down')} />
          {onRefresh && <Action icon="refresh" onPress={() => onRefresh(message)} />}
        </View>
      )}
    </View>
  );
}

function Action({ icon, active, onPress }: { icon: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} hitSlop={6}>
      <MaterialCommunityIcons name={icon as any} size={17} color={active ? COLORS.primary : COLORS.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  userContainer: { marginVertical: 6, alignSelf: 'flex-end', maxWidth: '88%' },
  userBubble: {
    backgroundColor: COLORS.primary, borderRadius: 18, borderBottomRightRadius: 5,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  aiContainer: { marginVertical: 8, alignSelf: 'stretch', width: '100%' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
});
