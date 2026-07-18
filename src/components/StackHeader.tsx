import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

/** Back-navigable header for pushed stack screens. */
export function StackHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + spacing.sm,
          backgroundColor: colors.cream,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      <ThemedText variant="h3" style={styles.title} numberOfLines={1}>
        {title}
      </ThemedText>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  right: { width: 44, alignItems: 'center' },
});
