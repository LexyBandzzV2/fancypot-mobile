import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';
import { Glass } from './Glass';

/**
 * Lightweight in-page header used by the tab screens (the tab bar hides the
 * native stack header). Title uses the Cormorant display face.
 */
export function AppHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.cream }]}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <ThemedText variant="h1">{title}</ThemedText>
          {subtitle ? (
            <ThemedText variant="labelSmall" color={colors.inkMuted}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </View>
  );
}

export function HeaderIconButton({
  onPress,
  children,
  label,
}: {
  onPress: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Glass style={styles.iconBtn} intensity={35}>
        {children}
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titles: { flex: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
