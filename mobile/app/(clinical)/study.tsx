import React, { useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card, Button, ProgressBar, Chip } from 'react-native-paper';
import { useChatStore } from '@/stores/chat.store';
import { AppScreen } from '@/components/layout/AppScreen';
import { COLORS } from '@/constants/theme';

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  source: string;
  flipped: boolean;
  rating?: 'easy' | 'medium' | 'hard';
}

function extractFlashcards(messages: ReturnType<typeof useChatStore.getState>['messages']): Flashcard[] {
  const cards: Flashcard[] = [];
  const pairs = [];

  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === 'user' && messages[i + 1].role === 'assistant') {
      pairs.push({ q: messages[i], a: messages[i + 1] });
    }
  }

  for (const pair of pairs) {
    const answer = pair.a.content;
    const shortAnswer = answer.length > 300 ? answer.slice(0, 300) + '…' : answer;
    const source = pair.a.citations[0]?.source_name ?? 'Aboy AI';
    cards.push({
      id: pair.q.id,
      question: pair.q.content,
      answer: shortAnswer,
      source,
      flipped: false,
    });
  }

  return cards;
}

export default function StudyScreen() {
  const messages = useChatStore((s) => s.messages);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(() => extractFlashcards(messages));
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'list' | 'quiz'>('list');

  const rated = flashcards.filter((c) => c.rating).length;

  function flipCard(id: string) {
    setFlashcards((prev) => prev.map((c) => (c.id === id ? { ...c, flipped: !c.flipped } : c)));
  }

  function rateCard(id: string, rating: 'easy' | 'medium' | 'hard') {
    setFlashcards((prev) => prev.map((c) => (c.id === id ? { ...c, rating } : c)));
    setActiveIndex((i) => Math.min(i + 1, flashcards.length - 1));
  }

  if (flashcards.length === 0) {
    return (
      <AppScreen title="Study">
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>No flashcards yet</Text>
          <Text style={styles.emptyBody}>
            Ask questions in Chat — each Q&A automatically becomes a flashcard here.
          </Text>
        </View>
      </AppScreen>
    );
  }

  if (mode === 'quiz') {
    const card = flashcards[activeIndex];
    if (!card) return null;

    return (
      <AppScreen title="Study">
      <View style={styles.quizContainer}>
        <View style={styles.quizHeader}>
          <Text style={styles.quizProgress}>
            {activeIndex + 1} / {flashcards.length}
          </Text>
          <Button mode="text" onPress={() => setMode('list')}>Back to list</Button>
        </View>
        <ProgressBar
          progress={(activeIndex + 1) / flashcards.length}
          color={COLORS.primary}
          style={styles.progressBar}
        />

        <TouchableOpacity onPress={() => flipCard(card.id)} style={styles.cardTouchable}>
          <Card style={[styles.quizCard, card.flipped && styles.quizCardFlipped]}>
            <Card.Content style={styles.quizCardContent}>
              {!card.flipped ? (
                <>
                  <Text style={styles.cardLabel}>QUESTION</Text>
                  <Text style={styles.cardQuestion}>{card.question}</Text>
                  <Text style={styles.tapHint}>Tap to reveal answer</Text>
                </>
              ) : (
                <>
                  <Text style={styles.cardLabel}>ANSWER</Text>
                  <Text style={styles.cardAnswer}>{card.answer}</Text>
                  <Text style={styles.sourceText}>Source: {card.source}</Text>
                </>
              )}
            </Card.Content>
          </Card>
        </TouchableOpacity>

        {card.flipped && (
          <View style={styles.ratingRow}>
            <Button
              mode="contained"
              buttonColor={COLORS.error}
              onPress={() => rateCard(card.id, 'hard')}
              style={styles.rateBtn}
            >
              Hard
            </Button>
            <Button
              mode="contained"
              buttonColor={COLORS.warning}
              onPress={() => rateCard(card.id, 'medium')}
              style={styles.rateBtn}
            >
              Medium
            </Button>
            <Button
              mode="contained"
              buttonColor={COLORS.success}
              onPress={() => rateCard(card.id, 'easy')}
              style={styles.rateBtn}
            >
              Easy
            </Button>
          </View>
        )}
      </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Study">
    <View style={styles.flex}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{flashcards.length} flashcards</Text>
        <Button mode="contained" onPress={() => { setActiveIndex(0); setMode('quiz'); }}>
          Start Quiz
        </Button>
      </View>

      {rated > 0 && (
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            {rated}/{flashcards.length} reviewed · {flashcards.filter((c) => c.rating === 'hard').length} hard
          </Text>
          <ProgressBar
            progress={rated / flashcards.length}
            color={COLORS.primary}
            style={styles.miniProgress}
          />
        </View>
      )}

      <FlatList
        data={flashcards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text style={styles.cardNum}>#{index + 1}</Text>
              <Text style={styles.questionText} numberOfLines={2}>{item.question}</Text>
              {item.rating && (
                <Chip
                  compact
                  style={[
                    styles.ratingChip,
                    item.rating === 'easy' && { backgroundColor: '#e8f5e9' },
                    item.rating === 'medium' && { backgroundColor: '#fff3e0' },
                    item.rating === 'hard' && { backgroundColor: '#ffebee' },
                  ]}
                  textStyle={{ fontSize: 10 }}
                >
                  {item.rating}
                </Chip>
              )}
            </Card.Content>
          </Card>
        )}
      />
    </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 16, gap: 8 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  listTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  statsRow: { paddingHorizontal: 16, paddingBottom: 8 },
  statsText: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  miniProgress: { height: 4, borderRadius: 2 },
  card: { backgroundColor: COLORS.surface },
  cardNum: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  questionText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  ratingChip: { marginTop: 6, alignSelf: 'flex-start' },

  // Quiz mode
  quizContainer: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  quizProgress: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 24 },
  cardTouchable: { flex: 1 },
  quizCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    elevation: 3,
    marginBottom: 16,
  },
  quizCardFlipped: { backgroundColor: COLORS.secondary },
  quizCardContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  cardLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 16 },
  cardQuestion: { fontSize: 20, fontWeight: '600', color: COLORS.text, textAlign: 'center', lineHeight: 28 },
  cardAnswer: { fontSize: 16, color: COLORS.text, textAlign: 'center', lineHeight: 24 },
  tapHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 24 },
  sourceText: { fontSize: 11, color: COLORS.primary, marginTop: 16, fontStyle: 'italic' },
  ratingRow: { flexDirection: 'row', gap: 8, paddingBottom: 16 },
  rateBtn: { flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
});
