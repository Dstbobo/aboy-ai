import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getWelcome, type Welcome } from '@/services/intelligence.service';
import { recordEvent } from '@/services/usage.service';
import { scheduleStreakNudges } from '@/services/nudges';
import { COLORS } from '@/constants/theme';

/**
 * Intelligent welcome-back home shown before a fresh chat. Personalised from
 * the user's learning-intelligence profile: time-aware greeting, time-away
 * message, streak, milestone celebration, and quick-action cards specific to
 * the user's role + history.
 */
export function WelcomeHome({ onPick }: { onPick: (prompt: string) => void }) {
  const [w, setW] = useState<Welcome | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    recordEvent('welcome_shown');
    getWelcome()
      .then((res) => {
        if (!alive) return;
        setW(res);
        // Drive the addiction loop: keep the streak alive with local nudges.
        scheduleStreakNudges(res.streak).catch(() => {});
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.logo}>
        <Text style={styles.logoLetter}>A</Text>
      </View>

      <Text style={styles.greeting}>{w?.greeting ?? 'Hello'}</Text>
      {!!w?.message && <Text style={styles.message}>{w.message}</Text>}

      {w && w.streak > 0 && (
        <View style={styles.streakPill}>
          <MaterialCommunityIcons name="fire" size={18} color="#fff" />
          <Text style={styles.streakText}>{w.streak} day streak</Text>
        </View>
      )}

      {!!w?.celebration && (
        <View style={styles.celebrate}>
          <MaterialCommunityIcons name="party-popper" size={18} color={COLORS.primaryDark} />
          <Text style={styles.celebrateText}>{w.celebration}</Text>
        </View>
      )}

      {!!w?.progress && !w?.celebration && <Text style={styles.progress}>{w.progress}</Text>}

      <View style={styles.cards}>
        {(w?.cards ?? []).map((c, i) => (
          <TouchableOpacity key={i} style={styles.card} activeOpacity={0.85} onPress={() => { recordEvent('starter_tapped'); onPick(c.prompt); }}>
            <View style={styles.cardIcon}>
              <MaterialCommunityIcons name={c.icon as any} size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{c.title}</Text>
              {!!c.subtitle && <Text style={styles.cardSub}>{c.subtitle}</Text>}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, paddingTop: 40, alignItems: 'center' },
  logo: {
    width: 60, height: 60, borderRadius: 17, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  logoLetter: { color: '#fff', fontSize: 34, fontWeight: '800' },
  greeting: { fontSize: 25, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  message: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
    backgroundColor: '#f97316', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  streakText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  celebrate: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: COLORS.secondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  celebrateText: { color: COLORS.primaryDark, fontWeight: '600', fontSize: 13.5, flexShrink: 1 },
  progress: { fontSize: 13.5, color: COLORS.primary, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  cards: { width: '100%', marginTop: 26, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, padding: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)',
  },
  cardIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 19 },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});
