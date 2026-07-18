import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { radius } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

/** Shimmering placeholder block for loading states. */
export function Skeleton({
  width = '100%',
  height = 16,
  style,
  round,
}: {
  width?: number | `${number}%` | 'auto';
  height?: number;
  style?: ViewStyle;
  round?: boolean;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  const { colors } = useTheme();

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          opacity,
          borderRadius: round ? height / 2 : radius.sm,
          backgroundColor: colors.blush,
        },
        style,
      ]}
    />
  );
}

/** A grid of skeleton cards, used by the closet/library while data loads. */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} width="47%" height={180} style={styles.gridItem} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridItem: { marginBottom: 14 },
});
