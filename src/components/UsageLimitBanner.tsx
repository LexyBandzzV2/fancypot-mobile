import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/theme';
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
  return (
    <Pressable
      onPress={() => router.push('/paywall')}
      style={styles.wrap}
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
    backgroundColor: colors.pinkWarmGlow,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.pinkWarmSoft,
  },
  text: { flex: 1 },
});
