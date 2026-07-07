import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, ThemedText, Wordmark } from '@/components';
import { colors, spacing } from '@/theme';

/** Shown for any unmatched route (expo-router convention). */
export default function NotFound() {
  const router = useRouter();
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { marginTop: spacing.lg },
  body: { marginTop: spacing.sm, marginBottom: spacing.xl },
});
