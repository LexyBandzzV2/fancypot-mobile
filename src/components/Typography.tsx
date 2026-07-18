import React from 'react';
import { Text, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { type } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

type Variant = keyof typeof type;

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  /** Explicit color override. Omit to use the theme's primary ink (recommended
   * — it flips correctly between light/dark automatically). */
  color?: string;
  center?: boolean;
  children: React.ReactNode;
}

export function ThemedText({
  variant = 'body',
  color,
  center,
  style,
  children,
  ...rest
}: ThemedTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      style={[type[variant] as TextStyle, { color: color ?? colors.ink }, center && styles.center, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** The "Fancy Pot" script wordmark. Scales down to fit narrow screens. */
export function Wordmark({ size = 52, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[
        type.wordmark,
        { fontSize: size, lineHeight: size * 1.14, color: color ?? colors.ink, maxWidth: '100%' },
      ]}
    >
      Fancy Pot
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
