import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, fillObject } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';
import { Glass } from './Glass';

/**
 * Native-feeling bottom sheet: slides up from the bottom over a dimmed backdrop,
 * dismisses on backdrop tap. Used app-wide in place of center pop-up modals.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  // LIGHT MODE ONLY: the sheet's Glass blur sits over the dark backdrop below,
  // and expo-blur's light tint over that reads as a washed-out gray instead of
  // the warm cream/blush surfaces everywhere else. Force a nearly opaque warm
  // tint to kill the gray (same fix as NavDrawer's panel). Dark mode passes
  // undefined so Glass falls back to its theme-driven `glassFill`, leaving
  // dark visuals untouched.
  const sheetTint = scheme === 'light' ? 'rgba(255, 246, 247, 0.97)' : undefined;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      translateY.setValue(600);
      backdrop.setValue(0);
    }
  }, [visible, translateY, backdrop]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
          <Glass
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
            intensity={45}
            tintColor={sheetTint}
          >
            <Handle />
            {title ? (
              <ThemedText variant="h3" style={styles.title}>
                {title}
              </ThemedText>
            ) : null}
            {children}
          </Glass>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Handle() {
  const { colors } = useTheme();
  return <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />;
}

/** A single tappable row inside a bottom sheet. */
export function SheetAction({
  label,
  onPress,
  destructive,
  icon,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      accessibilityRole="button"
    >
      {icon ? <View style={styles.actionIcon}>{icon}</View> : null}
      <ThemedText variant="body" color={destructive ? colors.danger : colors.ink}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // Darker than `colors.overlay` — a glass sheet needs more backdrop contrast
  // to read clearly against busy content behind it. Mirrors colors.scrim
  // (static here because this StyleSheet is module-level, not themed).
  backdrop: { ...fillObject, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  sheetWrap: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  title: { marginBottom: spacing.md },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  actionPressed: { opacity: 0.6 },
  actionIcon: { width: 24, alignItems: 'center' },
});
