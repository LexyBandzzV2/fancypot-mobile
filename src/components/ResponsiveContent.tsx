import React from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { useResponsive } from '@/hooks/useResponsive';

interface ResponsiveContentProps {
  children: React.ReactNode;
  /**
   * Max content width. Defaults to the responsive `contentMaxWidth`
   * (full width on phone, capped on tablet). Pass a number to force a
   * narrower measure — e.g. forms read better around 520.
   */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Centers its children horizontally and caps their width on iPad, while being a
 * transparent full-width passthrough on phone. This is how the phone-first
 * layout survives a 13" iPad: instead of stretching a form or feed edge-to-edge,
 * wrap it so it sits in a comfortable centered column.
 *
 * Phone: `contentMaxWidth` equals the screen width, so `maxWidth` is a no-op and
 * layout is byte-for-byte what it was before. Only tablet widths change.
 */
export function ResponsiveContent({ children, maxWidth, style }: ResponsiveContentProps) {
  const { contentMaxWidth } = useResponsive();
  const cap = maxWidth ?? contentMaxWidth;
  return (
    <View style={[{ width: '100%', maxWidth: cap, alignSelf: 'center' }, style]}>
      {children}
    </View>
  );
}
