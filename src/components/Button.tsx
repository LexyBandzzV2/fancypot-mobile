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
import { colors, radius, spacing, type, TAP_TARGET } from '@/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent';

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
  const isDisabled = disabled || loading;

  const handlePress = async () => {
    if (isDisabled) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await onPress();
  };

  const palette = VARIANTS[variant];

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

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.ink, fg: colors.cream, border: colors.ink },
  accent: { bg: colors.pinkWarm, fg: colors.white, border: colors.pinkWarm },
  secondary: { bg: colors.blush, fg: colors.ink, border: colors.blush },
  outline: { bg: 'transparent', fg: colors.ink, border: colors.blushDeep },
  ghost: { bg: 'transparent', fg: colors.ink, border: 'transparent' },
};

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
