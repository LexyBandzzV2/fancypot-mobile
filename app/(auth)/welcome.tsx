import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ThemedText, Wordmark } from '@/components';
import { Glass } from '@/components/Glass';
import { spacing, type } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

/**
 * Landing / hero — mirrors the web homepage:
 *   eyebrow "BREAKFAST AT YOUR CLOSET", the Fancy Pot wordmark, tagline,
 *   and the primary "Start your closet" CTA.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.cream }]}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xxxl }]}>
        <ThemedText style={type.eyebrow} color={colors.blushDeep} center>
          Breakfast at your closet
        </ThemedText>
        <View style={styles.wordmark}>
          <Wordmark size={60} />
        </View>
        <Glass style={styles.taglineCard} intensity={30}>
          <ThemedText variant="bodyItalic" color={colors.inkMuted} center>
            Your private stylist. Photograph your clothes, build dream outfits, and shop the
            missing pieces from the places you love.
          </ThemedText>
        </Glass>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button label="Start your closet" onPress={() => router.push('/(auth)/sign-up')} />
        <View style={styles.gap} />
        <Button
          label="I already have an account"
          variant="outline"
          onPress={() => router.push('/(auth)/sign-in')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  hero: { alignItems: 'center', paddingHorizontal: spacing.xl },
  wordmark: { marginTop: spacing.lg, marginBottom: spacing.lg },
  taglineCard: {
    maxWidth: 340,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actions: { paddingHorizontal: spacing.lg },
  gap: { height: spacing.md },
});
