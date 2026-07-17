import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, ThemedText, Wordmark } from '@/components';
import { spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';

/** Shown for any unmatched route (expo-router convention). */
export default function NotFound() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.root}>
      <Wordmark size={40} />
      <ThemedText variant="h2" center style={styles.title}>
        This page wandered off
      </ThemedText>
      <ThemedText variant="body" color={colors.inkMuted} center style={styles.body}>
        We couldn't find what you were looking for.
      </ThemedText>
      <Button label="Back to your closet" fullWidth={false} onPress={() => router.replace('/(tabs)')} />
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    title: { marginTop: spacing.lg },
    body: { marginTop: spacing.sm, marginBottom: spacing.xl },
  });
