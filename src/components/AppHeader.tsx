import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { useNavDrawer } from '@/providers/NavDrawerProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { ThemedText } from './Typography';
import { Glass } from './Glass';

/**
 * Lightweight in-page header used by the tab screens (the tab bar hides the
 * native stack header). Title uses the Cormorant display face. A leading menu
 * button opens the app-wide navigation drawer; pass `menu={false}` to hide it.
 */
export function AppHeader({
  title,
  subtitle,
  right,
  menu = true,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  menu?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { openDrawer } = useNavDrawer();
  const { isTablet, contentMaxWidth } = useResponsive();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.cream }]}>
      <View
        style={[
          styles.row,
          isTablet && { alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth },
        ]}
      >
        {menu ? (
          <Pressable
            onPress={openDrawer}
            hitSlop={12}
            style={styles.menuBtn}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
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
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  titles: { flex: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
