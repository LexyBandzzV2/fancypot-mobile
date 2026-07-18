import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';
import { Button } from './Button';

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.badge, { backgroundColor: colors.pinkWarmGlow }]}>
        <Ionicons name={icon} size={30} color={colors.blushDeep} />
      </View>
      <ThemedText variant="h2" center>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText variant="body" color={colors.inkMuted} center style={styles.body}>
          {body}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  badge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  body: { marginTop: spacing.sm, maxWidth: 300 },
  action: { marginTop: spacing.xl },
});
