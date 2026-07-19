import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, spacing, type, TAP_TARGET } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import type { Colors } from '@/theme/colors';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent' | 'accentInk' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  haptic?: boolean;
  style?: ViewStyle;
}

/**
 * Full-width, thumb-friendly button. Minimum height meets the 48px tap-target
 * guideline and fires a light haptic on press by default.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  icon,
  haptic = true,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const handlePress = async () => {
    if (isDisabled) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await onPress();
  };

  const palette = variants(colors)[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border },
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const variants = (c: Colors): Record<Variant, { bg: string; fg: string; border: string }> => ({
  primary: { bg: c.ink, fg: c.cream, border: c.ink },
  accent: { bg: c.pinkWarm, fg: c.white, border: c.pinkWarm },
  // Filled pink with dark text — a loud secondary action (e.g. filter Clear).
  accentInk: { bg: c.pinkWarm, fg: c.ink, border: c.pinkWarm },
  secondary: { bg: c.blush, fg: c.ink, border: c.blush },
  outline: { bg: 'transparent', fg: c.ink, border: c.blushDeep },
  ghost: { bg: 'transparent', fg: c.ink, border: 'transparent' },
  // Destructive actions (delete account/outfit). White text in both themes —
  // the danger reds are dark enough for contrast either way.
  danger: { bg: c.danger, fg: '#FFFFFF', border: c.danger },
});

const styles = StyleSheet.create({
  base: {
    minHeight: TAP_TARGET,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: spacing.sm },
  label: { ...type.button },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
