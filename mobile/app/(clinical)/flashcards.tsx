import React, { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Text, Card, Button, ProgressBar, Chip } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useChatStore } from '@/stores/chat.store';
import { useProgressStore, extractTopics } from '@/stores/progress.store';
import { getSessions, getSessionMessages } from '@/services/history.service';
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

// Works on both live chat messages and history-loaded messages (which have no id).
type SrcMsg = { id?: string; role: string; content: string; citations?: { source_name?: string }[] };

function extractFlashcards(messages: SrcMsg[], idPrefix = ''): Flashcard[] {
  const cards: Flashcard[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === 'user' && messages[i + 1].role === 'assistant') {
      const q = messages[i];
      const a = messages[i + 1];
      // Skip blanks (e.g. an in-progress/empty streaming message).
      if (!q.content?.trim() || !a.content?.trim()) continue;
      cards.push({
        id: q.id ?? `${idPrefix}${i}`,
        question: q.content.trim(),
        answer: a.content.trim(),
        source: a.citations?.[0]?.source_name ?? 'Aboy AI',
        flipped: false,
      });
    }
  }
  return cards;
}

export default function FlashcardsScreen() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'list' | 'review'>('list');

  // Build cards from the user's ACTUAL history (past sessions in Supabase) plus
  // the current live chat — not just the in-memory session, which is often empty.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        const cards = extractFlashcards(useChatStore.getState().messages as SrcMsg[], 'live-');
        try {
          const sessions = await getSessions();
          const recent = sessions.slice(0, 12); // most recent conversations
          const results = await Promise.all(
            recent.map((s) =>
              getSessionMessages(s.session_id)
                .then((m) => ({ id: s.session_id, m }))
                .catch(() => null),
            ),
          );
          for (const r of results) {
            if (r) cards.push(...extractFlashcards(r.m as SrcMsg[], `${r.id}-`));
          }
        } catch {
          // history unavailable → fall back to whatever the live chat had
        }
        if (!alive) return;
        // De-duplicate by question text (the same thing asked in several sessions).
        const seen = new Set<string>();
        const unique = cards
          .filter((c) => {
            const k = c.question.trim().toLowerCase();
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map((c, i) => ({ ...c, id: String(i) })); // guaranteed-unique ids
        setFlashcards(unique);
        setActiveIndex(0);
        setLoading(false);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const rated = flashcards.filter((c) => c.rating).length;

  if (loading) {
    return (
      <AppScreen title="Flashcards">
        <View style={styles.empty}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </AppScreen>
    );
  }

  function flipCard(id: string) {
    setFlashcards((prev) => prev.map((c) => (c.id === id ? { ...c, flipped: !c.flipped } : c)));
  }

  function rateCard(id: string, rating: 'easy' | 'medium' | 'hard') {
    const card = flashcards.find((c) => c.id === id);
    if (card) {
      const topic = extractTopics(card.question)[0] ?? 'General';
      useProgressStore.getState().recordFlashcard(topic, rating);
    }
    setFlashcards((prev) => prev.map((c) => (c.id === id ? { ...c, rating } : c)));
    setActiveIndex((i) => Math.min(i + 1, flashcards.length - 1));
  }

  if (flashcards.length === 0) {
    return (
      <AppScreen title="Flashcards">
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

  if (mode === 'review') {
    const card = flashcards[activeIndex];
    if (!card) return null;

    return (
      <AppScreen title="Flashcards">
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

        {/* Card is NOT tap-to-flip — that fought with scrolling the long answer.
            The ScrollView scrolls freely; flipping is the explicit button below. */}
        <View style={[styles.reviewCard, card.flipped && styles.reviewCardFlipped]}>
          <Text style={styles.cardLabel}>{card.flipped ? 'ANSWER' : 'QUESTION'}</Text>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            showsVerticalScrollIndicator
          >
            <Text style={card.flipped ? styles.cardAnswer : styles.cardQuestion}>
              {card.flipped ? card.answer : card.question}
            </Text>
            {card.flipped && !!card.source && (
              <Text style={styles.sourceText}>Source: {card.source}</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.flipBtn} onPress={() => flipCard(card.id)} activeOpacity={0.7}>
            <Text style={styles.flipBtnText}>{card.flipped ? '↩  Show question' : 'Reveal answer  ↓'}</Text>
          </TouchableOpacity>
        </View>

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
    <AppScreen title="Flashcards">
    <View style={styles.flex}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{flashcards.length} flashcards</Text>
        <Button mode="contained" onPress={() => {
          setFlashcards((prev) => prev.map((c) => ({ ...c, flipped: false })));
          setActiveIndex(0);
          setMode('review');
        }}>
          Review cards
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
  // Plain scrollable review card (replaces paper Card so long answers show + scroll).
  reviewCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  reviewCardFlipped: { backgroundColor: COLORS.secondary, borderColor: '#bfe3d2' },
  cardScroll: { flex: 1 },
  cardScrollContent: { flexGrow: 1, paddingVertical: 8 },
  flipBtn: {
    marginTop: 12, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.secondary, borderWidth: 1, borderColor: COLORS.border,
  },
  flipBtnText: { fontSize: 14.5, fontWeight: '700', color: COLORS.primary },
  cardLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 12 },
  cardQuestion: { fontSize: 20, fontWeight: '700', color: COLORS.text, lineHeight: 28 },
  cardAnswer: { fontSize: 15.5, color: COLORS.text, lineHeight: 23 },
  tapHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 14, textAlign: 'center' },
  sourceText: { fontSize: 11.5, color: COLORS.primary, marginTop: 14, fontStyle: 'italic' },
  ratingRow: { flexDirection: 'row', gap: 8, paddingBottom: 16 },
  rateBtn: { flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
});
