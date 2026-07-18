import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

/**
 * The uppercase spaced eyebrow that titles a section ("OCCASION", "BUDGET",
 * "YOUR PLAN"...). Was hand-rolled with `letterSpacing: 1` on ~10 screens;
 * this is the single source of truth. Optional `hint` renders the small muted
 * explainer line under it.
 */
export function SectionLabel({
  children,
  hint,
  style,
}: {
  children: React.ReactNode;
  hint?: string;
  style?: TextStyle;
}) {
  const { colors } = useTheme();
  return (
    <>
      <ThemedText variant="label" color={colors.inkMuted} style={[styles.label, style]}>
        {children}
      </ThemedText>
      {hint ? (
        <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.hint}>
          {hint}
        </ThemedText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  hint: { marginTop: -spacing.xs, marginBottom: spacing.sm, lineHeight: 16 },
});
