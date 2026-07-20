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
        {
          fontSize: size,
          // Great Vibes has tall capital swashes (the F and P flourishes) that
          // clip against a tight line box. Give generous leading plus a little
          // top padding so the tops of "Fancy Pot" are never cut off.
          lineHeight: size * 1.45,
          paddingTop: Math.ceil(size * 0.12),
          includeFontPadding: true,
          color: color ?? colors.ink,
          maxWidth: '100%',
        },
      ]}
    >
      Fancy Pot
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
