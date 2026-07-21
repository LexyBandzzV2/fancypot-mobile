import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

/**
 * Lightweight, self-contained confirmation toast. Drop
 * `<Toast message={msg} onHide={() => setMsg(null)} />` into a screen and set
 * `message` to show it: it fades/slides in, holds ~1.6s, fades out, then calls
 * onHide. No global provider or portal needed.
 */
export function Toast({
  message,
  onHide,
  icon = 'checkmark-circle',
}: {
  message: string | null;
  onHide: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const anim = useRef(new Animated.Value(0)).current;
  // Keep onHide fresh without retriggering the effect when the parent passes an
  // inline callback (which changes identity every render).
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!message) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) onHideRef.current();
        },
      );
    }, 1600);
    return () => clearTimeout(t);
  }, [message, anim]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <View style={styles.pill}>
        <Ionicons name={icon} size={18} color={colors.cream} />
        <ThemedText variant="label" color={colors.cream}>
          {message}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 110,
      alignItems: 'center',
      zIndex: 100,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.ink,
      shadowColor: c.ink,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      maxWidth: '86%',
    },
  });
