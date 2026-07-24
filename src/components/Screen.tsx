import React from 'react';
import { StyleSheet, View, ScrollView, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Apply top safe-area inset (for screens without a native header). */
  edgeTop?: boolean;
  style?: ViewStyle;
  refreshControl?: React.ReactElement<any>;
  contentStyle?: ViewStyle;
  /**
   * Opt-in cap for the content column width — a future-facing escape hatch
   * for screens that want a centered measure on tablet instead of the
   * full-bleed phone layout. `true` uses the responsive `contentMaxWidth`
   * (which equals the full screen width on phone, so it's a no-op there); a
   * number pins an explicit cap instead. Omit (the default) to keep today's
   * layout exactly as-is — every existing caller passes nothing.
   */
  maxContentWidth?: boolean | number;
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
  maxContentWidth,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const pad = padded ? { paddingHorizontal: spacing.lg } : null;
  const top = edgeTop ? { paddingTop: insets.top } : null;
  const bg = { backgroundColor: colors.cream };

  const cap: ViewStyle | null =
    maxContentWidth === true
      ? { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }
      : typeof maxContentWidth === 'number'
        ? { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }
        : null;

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
          {cap ? <View style={[styles.flex, cap]}>{children}</View> : children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, bg, styles.flex, pad, top, style]}>
      {cap ? <View style={[styles.flex, cap]}>{children}</View> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl, flexGrow: 1 },
});
