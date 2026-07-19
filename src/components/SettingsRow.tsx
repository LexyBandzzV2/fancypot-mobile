import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';
import { Card } from './Card';

/**
 * Grouped settings card — wraps SettingsRow children with dividers between
 * them. Extracted from the hand-rolled Row/LinkRow/Divider trio in profile.tsx
 * so every settings-style list shares one implementation.
 */
export function SettingsGroup({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <Card padded={false}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={styles.divider} /> : null}
          {child}
        </React.Fragment>
      ))}
    </Card>
  );
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Right-aligned secondary text (e.g. "Light Mode", "24 outfits/mo"). */
  value?: string;
  /** Tappable row with a chevron; omit for a static info row. */
  onPress?: () => void;
  destructive?: boolean;
}

export function SettingsRow({ icon, label, value, onPress, destructive }: SettingsRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const fg = destructive ? colors.danger : colors.ink;

  const body = (
    <>
      {/* Web profile rows: icon in a soft pink-cream circle, pink glyph. */}
      <View style={[styles.iconCircle, destructive && styles.iconCircleDestructive]}>
        <Ionicons name={icon} size={16} color={destructive ? colors.danger : colors.pinkWarm} />
      </View>
      <ThemedText variant="body" color={fg} style={styles.label}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText variant="labelSmall" color={colors.inkMuted}>
          {value}
        </ThemedText>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
    },
    label: { flex: 1 },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.beige,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircleDestructive: { backgroundColor: c.danger_soft },
    pressed: { opacity: 0.6 },
    divider: { height: 1, backgroundColor: c.border, marginLeft: spacing.lg },
  });
