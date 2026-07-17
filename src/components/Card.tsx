import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { Glass } from './Glass';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  /** Frosted-glass surface instead of a flat fill. Default true — this is the
   * app's 2026 aesthetic; pass `glass={false}` for the rare flat-surface case. */
  glass?: boolean;
}

export function Card({ children, style, padded = true, glass = true }: CardProps) {
  const { colors, isDark } = useTheme();

  if (glass) {
    return (
      <Glass
        intensity={isDark ? 30 : 50}
        style={[styles.card, padded && styles.padded, style]}
      >
        {children}
      </Glass>
    );
  }

  return (
    <View
      style={[
        styles.card,
        styles.flat,
        { backgroundColor: colors.white, borderColor: colors.border, shadowColor: colors.ink },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  flat: {
    borderWidth: 1,
    // soft petal shadow
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  padded: { padding: spacing.lg },
});
