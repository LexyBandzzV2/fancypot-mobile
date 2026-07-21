import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, spacing, radius, fillObject, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

/**
 * "Fancy Pot is cooking…" — the loading animation shown while Style Me and
 * Virtual Try-On generate an image. A faithful React Native port of the web
 * UI-blueprint's CookingAnimation: a pink pot with a stirring wooden spoon,
 * rising steam, a wobbling broth, and clothing emojis dropping in — plus an
 * optional "Save & wait" so the user can leave and have the result auto-saved.
 *
 * Wooden-spoon browns are kept literal (matching the reference) since they're
 * outside the brand palette on purpose.
 */

type Props = {
  open: boolean;
  label?: string;
  onSaveAndWait?: () => void;
  savedForLater?: boolean;
};

const DROPS = ['👗', '👚', '👖', '👠', '👜', '🧥', '👒'];
const STAGE = 260;
const POT_W = 200;

export function CookingAnimation({ open, label, onSaveAndWait, savedForLater }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Spoon stir: sway -18° ↔ 18° and back (≈1.6s round trip).
  const stir = useRef(new Animated.Value(0)).current;
  // Broth surface wobble.
  const broth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!open) return;
    const stirLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(stir, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(stir, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const brothLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(broth, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(broth, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    stirLoop.start();
    brothLoop.start();
    return () => {
      stirLoop.stop();
      brothLoop.stop();
    };
  }, [open, stir, broth]);

  if (!open) return null;

  const spoonRotate = stir.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '18deg'] });

  return (
    <View style={styles.overlay}>
      <ThemedText variant="eyebrow" color={colors.pinkWarm}>
        Fancy Pot
      </ThemedText>
      <Text style={[styles.script, { color: colors.ink }]}>is cooking…</Text>
      <ThemedText variant="body" color={colors.inkMuted} center style={styles.label}>
        {label ?? 'Stirring up an outfit just for you.'}
      </ThemedText>

      <View style={styles.stage}>
        {/* Falling clothes */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {DROPS.map((d, i) => (
            <FallingItem key={i} emoji={d} leftPct={8 + i * 12} delay={i * 340} />
          ))}
        </View>

        {/* Pot */}
        <View style={styles.potWrap}>
          {/* Steam */}
          <View style={styles.steamRow}>
            {[0, 1, 2].map((i) => (
              <Steam key={i} delay={i * 300} color="rgba(255,255,255,0.7)" />
            ))}
          </View>

          <View style={styles.potBody}>
            {/* Spoon that stirs */}
            <Animated.View style={[styles.spoon, { transform: [{ rotate: spoonRotate }] }]}>
              <View style={styles.spoonHandle} />
              <View style={styles.spoonBowl} />
            </Animated.View>

            {/* Rim */}
            <View style={styles.potRim} />
            {/* Body */}
            <View style={styles.potPot}>
              {/* Broth surface */}
              <Animated.View
                style={[
                  styles.broth,
                  {
                    opacity: broth.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
                    transform: [
                      { translateX: broth.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] }) },
                      { scaleY: broth.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) },
                    ],
                  },
                ]}
              />
              {/* Handles */}
              <View style={[styles.handle, styles.handleLeft]} />
              <View style={[styles.handle, styles.handleRight]} />
              {/* Mark */}
              <View style={styles.potMark}>
                <Text style={[styles.potMarkText, { color: colors.cream }]}>Fancy Pot</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Pulsing dots + sparkle */}
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} delay={i * 150} color={colors.pinkWarm} />
        ))}
        <Ionicons name="sparkles" size={16} color={colors.pinkWarm} style={styles.sparkle} />
      </View>

      {onSaveAndWait ? (
        <View style={styles.saveWrap}>
          <ThemedText variant="eyebrow" color={colors.pinkWarm} style={styles.saveEyebrow}>
            Don't want to wait?
          </ThemedText>
          <Pressable
            onPress={onSaveAndWait}
            disabled={savedForLater}
            style={styles.saveBtn}
            accessibilityRole="button"
          >
            <Ionicons name="time-outline" size={16} color={colors.cream} />
            <ThemedText variant="button" color={colors.cream}>
              {savedForLater ? 'Saved ✓ — closing…' : 'Save & wait'}
            </ThemedText>
          </Pressable>
          <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.saveHint}>
            We'll finish cooking in the background and drop it into your Saved outfits.
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

// A single clothing emoji falling from the top into the pot, on a loop. A
// one-shot phase delay staggers the wave without letting the loops drift.
function FallingItem({ emoji, leftPct, delay }: { emoji: string; leftPct: number; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, delay]);
  return (
    <Animated.Text
      style={{
        position: 'absolute',
        top: 0,
        left: `${leftPct}%`,
        fontSize: 22,
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-28, 150] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '20deg'] }) },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

function Steam({ delay, color }: { delay: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 24,
        borderRadius: 4,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.9, 0] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [4, -22] }) }],
      }}
    />
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
      }}
    />
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    overlay: {
      ...fillObject,
      zIndex: 60,
      elevation: 24,
      backgroundColor: c.cream,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    script: { fontFamily: fonts.script, fontSize: 40, lineHeight: 50, marginTop: 2, textAlign: 'center' },
    label: { marginTop: spacing.sm, maxWidth: 260 },
    stage: { width: STAGE, height: STAGE, marginTop: spacing.xl, justifyContent: 'flex-end', alignItems: 'center' },
    potWrap: { alignItems: 'center', width: POT_W },
    steamRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs, height: 24 },
    potBody: { position: 'relative', alignItems: 'center' },
    spoon: { position: 'absolute', top: -58, alignItems: 'center', zIndex: 2 },
    spoonHandle: { width: 12, height: 64, borderRadius: 6, backgroundColor: '#b47a55' },
    spoonBowl: {
      width: 32,
      height: 32,
      marginTop: -4,
      borderRadius: 16,
      backgroundColor: '#c68a63',
      borderWidth: 2,
      borderColor: '#a06a48',
    },
    potRim: { width: POT_W + 12, height: 16, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: c.pinkWarm },
    potPot: {
      width: POT_W,
      height: 112,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      backgroundColor: c.pinkWarm,
      overflow: 'hidden',
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    broth: {
      position: 'absolute',
      left: 12,
      right: 12,
      top: 6,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.pinkWarmSoft,
    },
    handle: { position: 'absolute', top: 14, width: 16, height: 16, borderRadius: 8, backgroundColor: c.pinkWarm },
    handleLeft: { left: -10 },
    handleRight: { right: -10 },
    potMark: { position: 'absolute', left: 0, right: 0, bottom: 8, alignItems: 'center' },
    potMarkText: { fontFamily: fonts.script, fontSize: 20, opacity: 0.9 },
    dots: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
    sparkle: { marginLeft: spacing.xs },
    saveWrap: { marginTop: spacing.xxl, alignItems: 'center' },
    saveEyebrow: { marginBottom: spacing.sm },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: c.pinkWarm,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    saveHint: { marginTop: spacing.sm, maxWidth: 260 },
  });
