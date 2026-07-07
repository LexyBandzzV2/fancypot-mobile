import React from 'react';
import { Text, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { colors, type } from '@/theme';

type Variant = keyof typeof type;

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  center?: boolean;
  children: React.ReactNode;
}

export function ThemedText({
  variant = 'body',
  color = colors.ink,
  center,
  style,
  children,
  ...rest
}: ThemedTextProps) {
  return (
    <Text
      style={[type[variant] as TextStyle, { color }, center && styles.center, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** The "Fancy Pot" script wordmark. Scales down to fit narrow screens. */
export function Wordmark({ size = 52, color = colors.ink }: { size?: number; color?: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[type.wordmark, { fontSize: size, lineHeight: size * 1.14, color, maxWidth: '100%' }]}
    >
      Fancy Pot
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
