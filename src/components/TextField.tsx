import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, type, TAP_TARGET, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import type { Colors } from '@/theme/colors';
import { ThemedText } from './Typography';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  secure?: boolean;
}

export function TextField({ label, error, secure, style, ...rest }: TextFieldProps) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      {label ? (
        <ThemedText style={type.label} color={colors.inkMuted}>
          {label}
        </ThemedText>
      ) : null}
      <View
        style={[
          styles.field,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.inkMuted}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.inkMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText style={type.labelSmall} color={colors.danger}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { gap: spacing.xs, marginBottom: spacing.md },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: TAP_TARGET,
      backgroundColor: c.white,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.lg,
    },
    focused: { borderColor: c.blushDeep },
    errored: { borderColor: c.danger },
    input: { flex: 1, ...type.body, color: c.ink, paddingVertical: spacing.md },
  });
