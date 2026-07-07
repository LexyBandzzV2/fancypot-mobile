import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type, TAP_TARGET } from '@/theme';
import { ThemedText } from './Typography';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  secure?: boolean;
}

export function TextField({ label, error, secure, style, ...rest }: TextFieldProps) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

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

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginBottom: spacing.md },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_TARGET,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  focused: { borderColor: colors.blushDeep },
  errored: { borderColor: colors.danger },
  input: { flex: 1, ...type.body, color: colors.ink, paddingVertical: spacing.md },
});
