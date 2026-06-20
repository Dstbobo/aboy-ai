import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS } from '@/constants/theme';

/**
 * Three pulsing dots shown while the AI is processing — appears immediately
 * after the user sends and disappears when the response arrives. When a
 * research-status `label` is supplied (Understanding → Searching references →
 * Searching diagrams → Analyzing sources → Generating answer) it is shown
 * beside the dots so the user SEES Aboy researching, not waiting.
 */
export function ThinkingDots({ label }: { label?: string | null }) {
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={styles.row}>
      <View style={styles.dots}>
        {dots.map((v, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0.3, 1], outputRange: [0.85, 1.15] }) }] }]}
          />
        ))}
      </View>
      {label ? <Text style={styles.label}>{label}…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  label: { fontSize: 13.5, color: COLORS.textSecondary, fontWeight: '500' },
});
