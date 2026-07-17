import React from 'react';
import { StyleSheet, View, ScrollView, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Apply top safe-area inset (for screens without a native header). */
  edgeTop?: boolean;
  style?: ViewStyle;
  refreshControl?: React.ReactElement<any>;
  contentStyle?: ViewStyle;
}

/** Standard themed-background page container with safe-area + optional scroll. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edgeTop = false,
  style,
  refreshControl,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pad = padded ? { paddingHorizontal: spacing.lg } : null;
  const top = edgeTop ? { paddingTop: insets.top } : null;
  const bg = { backgroundColor: colors.cream };

  if (scroll) {
    return (
      <View style={[styles.root, bg, top, style]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, pad, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return <View style={[styles.root, bg, styles.flex, pad, top, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl, flexGrow: 1 },
});
