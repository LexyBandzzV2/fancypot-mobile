import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

interface UploadZoneProps {
  onPress: () => void;
  /** When set, renders the picked image instead of the empty prompt. */
  imageUri?: string | null;
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Zone height; defaults to the try-on photo slot's 260. */
  height?: number;
  style?: ViewStyle;
}

/**
 * The premium "AI scanner" upload area from the design board: a softly
 * illuminated pink dashed border around a tap-to-upload prompt, swapping to
 * the picked image once one exists. Shared by Get the Look, Virtual Try-on,
 * and the closet add flow.
 */
export function UploadZone({
  onPress,
  imageUri,
  title = 'Tap to upload a photo',
  subtitle,
  icon = 'cloud-upload-outline',
  height = 260,
  style,
}: UploadZoneProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.zone,
        { height },
        imageUri ? styles.zoneFilled : null,
        pressed && styles.pressed,
        style,
      ]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.img} contentFit="cover" transition={200} />
      ) : (
        <View style={styles.empty}>
          <View style={styles.iconBadge}>
            <Ionicons name={icon} size={28} color={colors.pinkWarm} />
          </View>
          <ThemedText variant="label" color={colors.ink} center>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="labelSmall" color={colors.inkMuted} center>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    zone: {
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.pinkWarmSoft,
      backgroundColor: c.pinkWarmGlow,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      // Restrained pink illumination on the edge.
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2,
    },
    zoneFilled: { borderStyle: 'solid', borderColor: c.border, backgroundColor: c.pearl },
    pressed: { opacity: 0.9 },
    img: { width: '100%', height: '100%' },
    empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
    iconBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.white,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
  });
