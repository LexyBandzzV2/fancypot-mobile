import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';

type FabTone = 'ink' | 'accent';

interface FabProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string; // accessibility label — required, the button has no text
  /** 'ink' (default) or 'accent' (pink) fill. */
  tone?: FabTone;
  /** Compact 44pt variant (e.g. the feed's back-to-top nudge). */
  small?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/**
 * Floating circular action button, thumb-reachable above the tab bar.
 * Replaces the hand-rolled FABs on Closet (camera) and Feed (back-to-top).
 */
export function FloatingActionButton({
  icon,
  onPress,
  label,
  tone = 'ink',
  small = false,
  loading = false,
  style,
}: FabProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.fab,
        small && styles.small,
        tone === 'accent' && { backgroundColor: colors.pinkWarm, shadowColor: colors.pinkWarm },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.cream} />
      ) : (
        <Ionicons name={icon} size={small ? 20 : 26} color={colors.cream} />
      )}
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: spacing.lg,
      bottom: spacing.xl,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.ink,
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    small: { width: 44, height: 44, borderRadius: 22 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  });
