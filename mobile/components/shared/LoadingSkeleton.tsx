import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/theme';

export function LoadingSkeleton() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.9] });

  return (
    <View style={styles.container}>
      {[80, 60, 90, 50].map((w, i) => (
        <Animated.View
          key={i}
          style={[styles.line, { width: `${w}%`, opacity }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  line: {
    height: 12,
    backgroundColor: COLORS.border,
    borderRadius: 6,
  },
});
