import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

/**
 * Inline banner shown when the current tier is at/near an AI usage limit.
 * Tapping routes to the paywall.
 */
export function UsageLimitBanner({
  message,
  cta = 'Upgrade',
}: {
  message: string;
  cta?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/paywall')}
      style={[
        styles.wrap,
        { backgroundColor: colors.pinkWarmGlow, borderColor: colors.pinkWarmSoft },
      ]}
      accessibilityRole="button"
    >
      <Ionicons name="lock-closed" size={18} color={colors.pinkWarm} />
      <ThemedText variant="labelSmall" color={colors.ink} style={styles.text}>
        {message}
      </ThemedText>
      <ThemedText variant="label" color={colors.pinkWarm}>
        {cta}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  text: { flex: 1 },
});
