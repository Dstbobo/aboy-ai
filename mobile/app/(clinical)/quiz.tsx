import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppScreen } from '@/components/layout/AppScreen';
import { useProgressStore } from '@/stores/progress.store';
import { getQuiz, type Quiz } from '@/services/quiz.service';
import { COLORS } from '@/constants/theme';

type Phase = 'setup' | 'loading' | 'active' | 'done';

export default function QuizScreen() {
  const topics = useProgressStore((s) => s.topics);
  const suggestions = Object.values(topics)
    .sort((a, b) => b.queries - a.queries)
    .slice(0, 6)
    .map((t) => t.topic);

  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null); // selected option this question
  const [score, setScore] = useState(0);

  async function start(t: string) {
    setError(null);
    setTopic(t);
    setPhase('loading');
    try {
      const q = await getQuiz(t, 5);
      setQuiz(q);
      setIndex(0);
      setPicked(null);
      setScore(0);
      setPhase('active');
    } catch {
      setError('Could not generate a quiz. Please try again.');
      setPhase('setup');
    }
  }

  function choose(i: number) {
    if (picked !== null) return; // already answered
    setPicked(i);
    if (quiz && i === quiz.questions[index].correct) setScore((s) => s + 1);
  }

  function next() {
    if (!quiz) return;
    if (index + 1 >= quiz.questions.length) {
      setPhase('done');
    } else {
      setIndex((i) => i + 1);
      setPicked(null);
    }
  }

  // ── Setup ──
  if (phase === 'setup') {
    return (
      <AppScreen title="Quiz">
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.h1}>Test yourself</Text>
          <Text style={styles.sub}>
            Aboy generates a quick 5-question multiple-choice quiz, grades you instantly,
            and explains each answer.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Type a topic (e.g. Cardiology, sepsis, ECG)"
            placeholderTextColor={COLORS.textSecondary}
            value={topic}
            onChangeText={setTopic}
            returnKeyType="go"
            onSubmitEditing={() => start(topic)}
          />

          {suggestions.length > 0 && (
            <>
              <Text style={styles.label}>From what you've studied</Text>
              <View style={styles.chips}>
                {suggestions.map((s) => (
                  <TouchableOpacity key={s} style={styles.chip} onPress={() => start(s)}>
                    <Text style={styles.chipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={styles.primaryBtn} onPress={() => start(topic)}>
            <MaterialCommunityIcons name="lightning-bolt" size={20} color="#fff" />
            <Text style={styles.primaryText}>{topic.trim() ? 'Start quiz' : 'Surprise me'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </AppScreen>
    );
  }

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <AppScreen title="Quiz">
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Writing your questions…</Text>
        </View>
      </AppScreen>
    );
  }

  // ── Results ──
  if (phase === 'done' && quiz) {
    const total = quiz.questions.length;
    const pct = Math.round((score / total) * 100);
    const msg = pct >= 80 ? 'Excellent! 🎉' : pct >= 50 ? 'Good effort — keep going.' : 'Worth a review.';
    return (
      <AppScreen title="Quiz">
        <View style={styles.center}>
          <Text style={styles.scoreNum}>{score}/{total}</Text>
          <Text style={styles.scorePct}>{pct}%</Text>
          <Text style={styles.scoreMsg}>{msg}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => start(topic)}>
            <MaterialCommunityIcons name="refresh" size={20} color="#fff" />
            <Text style={styles.primaryText}>New quiz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPhase('setup')}>
            <Text style={styles.secondaryText}>Change topic</Text>
          </TouchableOpacity>
        </View>
      </AppScreen>
    );
  }

  // ── Active question ──
  if (phase === 'active' && quiz) {
    const q = quiz.questions[index];
    const answered = picked !== null;
    return (
      <AppScreen title="Quiz">
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.progress}>Question {index + 1} of {quiz.questions.length}</Text>
          <Text style={styles.question}>{q.question}</Text>

          {q.options.map((opt, i) => {
            const isCorrect = i === q.correct;
            const isPicked = i === picked;
            let optStyle = styles.option;
            let txtStyle = styles.optionText;
            if (answered && isCorrect) { optStyle = { ...styles.option, ...styles.optionCorrect }; txtStyle = styles.optionTextStrong; }
            else if (answered && isPicked && !isCorrect) { optStyle = { ...styles.option, ...styles.optionWrong }; txtStyle = styles.optionTextStrong; }
            return (
              <TouchableOpacity key={i} style={optStyle} onPress={() => choose(i)} disabled={answered} activeOpacity={0.85}>
                <Text style={styles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
                <Text style={txtStyle}>{opt}</Text>
                {answered && isCorrect && <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.success} />}
                {answered && isPicked && !isCorrect && <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.error} />}
              </TouchableOpacity>
            );
          })}

          {answered && (
            <View style={styles.explainBox}>
              <Text style={styles.explainText}>{q.explanation}</Text>
            </View>
          )}

          {answered && (
            <TouchableOpacity style={styles.primaryBtn} onPress={next}>
              <Text style={styles.primaryText}>
                {index + 1 >= quiz.questions.length ? 'See results' : 'Next question'}
              </Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </ScrollView>
      </AppScreen>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  h1: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 14.5, color: COLORS.textSecondary, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  label: { fontSize: 13, color: COLORS.textSecondary, marginTop: 20, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: COLORS.secondary, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
  },
  chipText: { fontSize: 13.5, color: COLORS.primaryDark, fontWeight: '600' },
  error: { color: COLORS.error, fontSize: 13.5, marginTop: 16 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, marginTop: 26,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, marginTop: 6 },
  secondaryText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  loadingText: { color: COLORS.textSecondary, fontSize: 15, marginTop: 16 },

  progress: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', marginBottom: 10 },
  question: { fontSize: 19, fontWeight: '700', color: COLORS.text, lineHeight: 27, marginBottom: 18 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  optionCorrect: { borderColor: COLORS.success, backgroundColor: '#f0faf4' },
  optionWrong: { borderColor: COLORS.error, backgroundColor: '#fdf1f1' },
  optionLetter: { fontSize: 14, fontWeight: '800', color: COLORS.primary, width: 18 },
  optionText: { flex: 1, fontSize: 15.5, color: COLORS.text, lineHeight: 21 },
  optionTextStrong: { flex: 1, fontSize: 15.5, color: COLORS.text, lineHeight: 21, fontWeight: '600' },
  explainBox: {
    backgroundColor: COLORS.secondary, borderRadius: 12, padding: 14, marginTop: 6,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  explainText: { fontSize: 14, color: COLORS.text, lineHeight: 21 },

  scoreNum: { fontSize: 52, fontWeight: '900', color: COLORS.primary },
  scorePct: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  scoreMsg: { fontSize: 15, color: COLORS.textSecondary, marginTop: 10 },
});
