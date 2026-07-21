import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

const DOTS = 3;
const STAGGER = 170; // ms between each heart's start
const UP = 520; // ms rise
const DOWN = 520; // ms fall

/**
 * Branded feed loading animation — a staggered "breathing hearts" wave with a
 * caption. Replaces the static skeleton grid on the feed so waiting feels
 * alive and on-brand (soft blush + warm pink). Pure Animated (native driver),
 * no extra deps. Phase delays are balanced so the three hearts stay perfectly
 * in sync across loops instead of drifting apart.
 */
export function FeedLoading({ message = 'Curating your finds…' }: { message?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const anims = useRef(Array.from({ length: DOTS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const maxFront = (DOTS - 1) * STAGGER;
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * STAGGER),
          Animated.timing(v, { toValue: 1, duration: UP, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: DOWN, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          // Balances total cycle time across hearts so the wave never drifts.
          Animated.delay(maxFront - i * STAGGER),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View style={styles.wrap}>
      <View style={styles.hearts}>
        {anims.map((v, i) => (
          <Animated.View
            key={i}
            style={{
              transform: [
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              ],
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            }}
          >
            <Ionicons name="heart" size={26} color={i === 1 ? colors.pinkWarm : colors.blushDeep} />
          </Animated.View>
        ))}
      </View>
      <ThemedText variant="label" color={colors.inkMuted} style={styles.msg}>
        {message}
      </ThemedText>
    </View>
  );
}

const makeStyles = (_c: Colors) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      paddingBottom: 96,
    },
    hearts: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end', height: 44 },
    msg: { letterSpacing: 0.5 },
  });
