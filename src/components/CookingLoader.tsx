import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

/**
 * "Cooking up your look" — the branded generation loader, themed on the Fancy
 * Pot. Garment icons drop into a pot, a spoon stirs, and steam curls up. Built
 * purely on the React Native Animated API (useNativeDriver everywhere — only
 * transform + opacity are animated, never layout) so it stays smooth.
 *
 * Reused in two places: full-size on the Style Me screen while a look cooks,
 * and `compact` as a small inline indicator for a background job.
 */

// The garments that tumble into the pot, cycled in order.
const GARMENTS: (keyof typeof Ionicons.glyphMap)[] = [
  'shirt-outline',
  'bag-handle-outline',
  'glasses-outline',
  'footsteps-outline',
];

interface CookingLoaderProps {
  /** Main caption under the pot. Defaults to "Cooking up your look…". */
  caption?: string;
  /** Optional muted second line (e.g. the occasion + vibe being cooked). */
  subCaption?: string;
  /** Small inline size for a background indicator. Default false (hero size). */
  compact?: boolean;
}

export function CookingLoader({
  caption = 'Cooking up your look…',
  subCaption,
  compact = false,
}: CookingLoaderProps) {
  const { colors } = useTheme();
  const scale = compact ? 0.62 : 1;
  const styles = useThemedStyles(colors, scale);

  // One driver per falling garment, plus the stir + steam drivers. Refs so the
  // Animated.Values survive re-renders without being recreated.
  const drops = useRef(GARMENTS.map(() => new Animated.Value(0))).current;
  const stir = useRef(new Animated.Value(0)).current;
  const steam = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Garments drop on a staggered loop so a new piece is always mid-air.
    const dropAnims = drops.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 420),
          Animated.timing(v, {
            toValue: 1,
            duration: 1680,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          // Keep every driver's total cycle equal so the stagger never drifts.
          Animated.delay((drops.length - 1 - i) * 420),
        ]),
      ),
    );

    // Spoon sweeps back and forth — a gentle stir.
    const stirAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(stir, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(stir, {
          toValue: -1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(stir, {
          toValue: 0,
          duration: 450,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    // Steam rises and fades on a slow loop.
    const steamAnim = Animated.loop(
      Animated.timing(steam, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );

    dropAnims.forEach((a) => a.start());
    stirAnim.start();
    steamAnim.start();

    return () => {
      dropAnims.forEach((a) => a.stop());
      stirAnim.stop();
      steamAnim.stop();
    };
  }, [drops, stir, steam]);

  const spoonRotate = stir.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-16deg', '16deg'],
  });

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={caption}>
      <View style={styles.stage}>
        {/* Soft glow behind the pot. */}
        <View style={styles.glow} pointerEvents="none" />

        {/* Steam curling up from the pot. */}
        {[0, 1, 2].map((i) => {
          const delayed = Animated.add(steam, new Animated.Value(-i * 0.28));
          const clamped = delayed.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={`steam-${i}`}
              pointerEvents="none"
              style={[
                styles.steam,
                { left: 54 * scale + i * 20 * scale },
                {
                  opacity: clamped.interpolate({
                    inputRange: [0, 0.25, 0.7, 1],
                    outputRange: [0, 0.5, 0.5, 0],
                  }),
                  transform: [
                    {
                      translateY: clamped.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -34 * scale],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}

        {/* Falling garments — drop in, get absorbed into the pot. */}
        {GARMENTS.map((icon, i) => {
          const v = drops[i];
          const translateY = v.interpolate({
            inputRange: [0, 1],
            outputRange: [-62 * scale, 26 * scale],
          });
          const opacity = v.interpolate({
            inputRange: [0, 0.12, 0.7, 1],
            outputRange: [0, 1, 1, 0],
          });
          const dropScale = v.interpolate({
            inputRange: [0, 0.7, 1],
            outputRange: [0.55, 1, 0.6],
          });
          const rotate = v.interpolate({
            inputRange: [0, 1],
            outputRange: [`${-12 + i * 6}deg`, `${12 - i * 4}deg`],
          });
          return (
            <Animated.View
              key={icon}
              pointerEvents="none"
              style={[
                styles.garment,
                { opacity, transform: [{ translateY }, { scale: dropScale }, { rotate }] },
              ]}
            >
              <Ionicons name={icon} size={26 * scale} color={colors.pinkWarm} />
            </Animated.View>
          );
        })}

        {/* The pot. */}
        <View style={styles.potWrap}>
          {/* Handles peeking out behind the rim. */}
          <View style={[styles.handle, styles.handleLeft]} />
          <View style={[styles.handle, styles.handleRight]} />
          <View style={styles.rim} />
          <View style={styles.body}>
            {/* Blush "stew" surface line inside the pot. */}
            <View style={styles.stew} />
          </View>

          {/* Spoon, pivoting from the top so the tip sweeps the pot. */}
          <Animated.View style={[styles.spoon, { transform: [{ rotate: spoonRotate }] }]}>
            <View style={styles.spoonHandle} />
            <View style={styles.spoonHead} />
          </Animated.View>
        </View>
      </View>

      <ThemedText variant={compact ? 'label' : 'h3'} center style={styles.caption}>
        {caption}
      </ThemedText>
      {subCaption ? (
        <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.sub}>
          {subCaption}
        </ThemedText>
      ) : null}
    </View>
  );
}

function useThemedStyles(colors: Colors, s: number) {
  return React.useMemo(() => makeStyles(colors, s), [colors, s]);
}

const makeStyles = (c: Colors, s: number) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
    // Fixed-size stage the pot + drops are absolutely positioned within.
    stage: {
      width: 160 * s,
      height: 150 * s,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    glow: {
      position: 'absolute',
      bottom: 4 * s,
      width: 150 * s,
      height: 90 * s,
      borderRadius: 75 * s,
      backgroundColor: c.pinkWarmGlow,
      opacity: 0.9,
    },
    steam: {
      position: 'absolute',
      top: 18 * s,
      width: 8 * s,
      height: 24 * s,
      borderRadius: 4 * s,
      backgroundColor: c.blush,
    },
    garment: {
      position: 'absolute',
      top: 30 * s,
      alignItems: 'center',
      justifyContent: 'center',
    },
    potWrap: {
      width: 132 * s,
      height: 96 * s,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    rim: {
      width: 132 * s,
      height: 16 * s,
      borderRadius: radius.pill,
      backgroundColor: c.pinkWarm,
      zIndex: 2,
    },
    body: {
      width: 108 * s,
      height: 72 * s,
      backgroundColor: c.ink,
      borderTopLeftRadius: 10 * s,
      borderTopRightRadius: 10 * s,
      borderBottomLeftRadius: 46 * s,
      borderBottomRightRadius: 46 * s,
      overflow: 'hidden',
      alignItems: 'center',
    },
    stew: {
      marginTop: 8 * s,
      width: 86 * s,
      height: 14 * s,
      borderRadius: radius.pill,
      backgroundColor: c.pinkWarmSoft,
      opacity: 0.9,
    },
    handle: {
      position: 'absolute',
      top: 12 * s,
      width: 16 * s,
      height: 22 * s,
      borderRadius: 8 * s,
      borderWidth: 4 * s,
      borderColor: c.blushDeep,
      backgroundColor: 'transparent',
      zIndex: 1,
    },
    handleLeft: { left: -4 * s },
    handleRight: { right: -4 * s },
    // Spoon pivots around its top; the head sits low, so it sweeps the pot.
    spoon: {
      position: 'absolute',
      top: -14 * s,
      right: 20 * s,
      alignItems: 'center',
      zIndex: 3,
    },
    spoonHandle: {
      width: 5 * s,
      height: 58 * s,
      borderRadius: 3 * s,
      backgroundColor: c.blushDeep,
    },
    spoonHead: {
      width: 18 * s,
      height: 14 * s,
      marginTop: -2 * s,
      borderRadius: 9 * s,
      backgroundColor: c.blushDeep,
    },
    caption: { marginTop: spacing.lg },
    sub: { marginTop: spacing.xs, maxWidth: 260 },
  });
