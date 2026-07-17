import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText, Wordmark } from './Typography';
import { Button } from './Button';

/**
 * Fallback UI for expo-router's ErrorBoundary. A caught render error shows this
 * recoverable native screen instead of a white crash (crashes get apps rejected).
 *
 * Safe even if ThemeProvider itself is what crashed: useTheme() degrades to a
 * static light-mode fallback rather than throwing when no provider is
 * mounted (see FALLBACK_THEME in providers/ThemeProvider.tsx) — so this
 * screen, and everything it renders, always has a color to draw with.
 */
export function ErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.cream }]}>
      <Wordmark size={40} />
      <ThemedText variant="h2" center style={styles.title}>
        Something went wrong
      </ThemedText>
      <ThemedText variant="body" color={colors.inkMuted} center style={styles.body}>
        The app hit an unexpected snag. Try again — your closet and account are safe.
      </ThemedText>
      {__DEV__ ? (
        <ThemedText variant="labelSmall" color={colors.danger} center style={styles.detail}>
          {error.message}
        </ThemedText>
      ) : null}
      <Button label="Try again" fullWidth={false} onPress={retry} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { marginTop: spacing.lg },
  body: { marginTop: spacing.sm, marginBottom: spacing.lg, maxWidth: 320 },
  detail: { marginBottom: spacing.lg, maxWidth: 320 },
});
