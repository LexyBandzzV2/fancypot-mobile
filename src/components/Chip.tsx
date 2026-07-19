import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

type Tone = 'ink' | 'accent';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /**
   * Legacy knob kept for caller compatibility. The web design (feed chips and
   * the filters page alike) fills every selected chip hot pink, so both tones
   * now render identically — accepted so existing call sites keep compiling.
   */
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  haptic?: boolean;
  style?: ViewStyle;
}

/**
 * The one pill chip, matching the web chips: unselected is a borderless
 * blush-filled pill (--pink-blush) with ink text; selected fills hot pink
 * with white text. Replaces the near-identical hand-rolled
 * FilterChip/SelectionChip/BrandChip/mode-chip copies that lived on five
 * screens (feed, closet, stylist, preferences, plus sheets).
 */
export function Chip({
  label,
  selected = false,
  onPress,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tone = 'ink',
  icon,
  disabled = false,
  haptic = true,
  style,
}: ChipProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const fg = selected ? colors.white : colors.ink;

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <Ionicons name={icon} size={14} color={fg} style={styles.icon} /> : null}
        <ThemedText variant="labelSmall" color={fg}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Horizontal gap-consistent wrap container for a group of chips. */
export function ChipWrap({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.wrap, style]}>{children}</View>;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.pinkWarmGlow,
      minHeight: 36,
      justifyContent: 'center',
    },
    chipOn: { backgroundColor: c.pinkWarm },
    content: { flexDirection: 'row', alignItems: 'center' },
    icon: { marginRight: spacing.xs },
    pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.4 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  });
