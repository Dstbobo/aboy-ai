import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Share, TextInput } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import type { Message } from '@/stores/chat.store';
import { useChatStore } from '@/stores/chat.store';
import { rateAnswer } from '@/services/usage.service';
import { CitationCard } from './CitationCard';
import { StreamingText } from './StreamingText';
import { MedicalImageCard } from './MedicalImageCard';
import { EmergencyBanner } from './EmergencyBanner';
import { COLORS } from '@/constants/theme';

interface Props {
  message: Message;
  onRefresh?: (message: Message) => void;
}

// Turn markdown into clean, speakable prose.
function cleanForSpeech(md: string): string {
  return (md || '')
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')              // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')  // links -> text
    .replace(/^\s{0,3}[#>]+\s*/gm, '')        // headings / blockquote markers
    .replace(/^\s*[-*+]\s+/gm, '')            // list bullets
    .replace(/\|/g, ' ')                      // table pipes
    .replace(/[*_~#`>]/g, ' ')                // stray markdown
    .replace(/\s*\n\s*\n\s*/g, '. ')          // paragraph breaks -> pause
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// expo-speech / Android TextToSpeech reject very long strings (~4000 chars),
// which made long answers play nothing. Split into sentence-aligned chunks.
function speechChunks(text: string, max = 3500): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur.length + s.length + 1) > max) {
      chunks.push(cur);
      cur = '';
    }
    if (s.length > max) {
      // Hard-split an over-long sentence.
      for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max));
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function MessageBubble({ message, onRefresh }: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [thanks, setThanks] = useState(false);

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

  async function togglePlay() {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const text = cleanForSpeech(message.content);
    if (!text) return;
    const chunks = speechChunks(text);
    Speech.stop(); // clear any prior queue
    setSpeaking(true);
    chunks.forEach((chunk, i) => {
      const isLast = i === chunks.length - 1;
      Speech.speak(chunk, {
        language: 'en-US',
        rate: 1.0,
        pitch: 1.0,
        onDone: isLast ? () => setSpeaking(false) : undefined,
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    });
  }

  function voteOpts(comment?: string) {
    return { auditId: message.auditId, sessionId: useChatStore.getState().sessionId, comment };
  }

  function flashThanks() {
    setThanks(true);
    setTimeout(() => setThanks(false), 2000);
  }

  async function rate(dir: 'up' | 'down') {
    setVote(dir);
    // Record the vote immediately (upsert — safe to overwrite with a comment).
    rateAnswer(voteOpts(), dir).catch(() => {});
    if (dir === 'down') {
      setShowComment(true); // invite an optional "what went wrong?"
    } else {
      setShowComment(false);
      flashThanks();
    }
  }

  async function submitComment() {
    const text = comment.trim();
    setShowComment(false);
    rateAnswer(voteOpts(text || undefined), 'down').catch(() => {});
    flashThanks();
  }

  // AI responses render full width on the background (Claude.ai style).
  return (
    <View style={styles.aiContainer}>
      {message.emergency_triggered && <EmergencyBanner />}
      <StreamingText content={message.content} isStreaming={message.isStreaming} />
      {message.image && <MedicalImageCard image={message.image} />}
      {message.citations.length > 0 && <CitationCard citations={message.citations} />}

      {!message.isStreaming && message.content.length > 0 && (
        <View style={styles.actions}>
          <Action icon={copied ? 'check' : 'content-copy'} active={copied} onPress={copy} />
          <Action icon="share-variant-outline" onPress={share} />
          <Action icon={speaking ? 'stop' : 'volume-high'} active={speaking} onPress={togglePlay} />
          <Action icon={vote === 'up' ? 'thumb-up' : 'thumb-up-outline'} active={vote === 'up'} onPress={() => rate('up')} />
          <Action icon={vote === 'down' ? 'thumb-down' : 'thumb-down-outline'} active={vote === 'down'} onPress={() => rate('down')} />
          {onRefresh && <Action icon="refresh" onPress={() => onRefresh(message)} />}
          {thanks && <Text style={styles.thanks}>Thanks for the feedback</Text>}
        </View>
      )}

      {showComment && (
        <View style={styles.commentBox}>
          <TextInput
            style={styles.commentInput}
            placeholder="What went wrong? (optional)"
            placeholderTextColor={COLORS.textSecondary}
            value={comment}
            onChangeText={setComment}
            multiline
            autoFocus
          />
          <View style={styles.commentRow}>
            <TouchableOpacity onPress={() => setShowComment(false)} hitSlop={6}>
              <Text style={styles.commentSkip}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.commentSend} onPress={submitComment} hitSlop={6}>
              <Text style={styles.commentSendText}>Send</Text>
            </TouchableOpacity>
          </View>
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
  thanks: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginLeft: 8 },
  commentBox: {
    marginTop: 8, backgroundColor: COLORS.secondary, borderRadius: 12, padding: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
  },
  commentInput: { fontSize: 14, color: COLORS.text, minHeight: 36, maxHeight: 100, paddingVertical: 2 },
  commentRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 6 },
  commentSkip: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  commentSend: { backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6 },
  commentSendText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
});
