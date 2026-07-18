import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { isAppleSignInAvailable } from '@/lib/socialAuth';
import { spacing, TAP_TARGET, type } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { Button } from './Button';
import { ThemedText } from './Typography';

interface SocialAuthButtonsProps {
  mode: 'sign-in' | 'sign-up';
  onApple: () => void | Promise<void>;
  onGoogle: () => void | Promise<void>;
  /** Disables both buttons while any auth request (social or password) is in flight. */
  loading?: boolean;
  /** Which button is currently submitting, so only that one shows a spinner. */
  loadingProvider?: 'apple' | 'google' | null;
}

/**
 * Shared "or" divider + native Apple button + Google button for the sign-in
 * and sign-up screens. Both providers land in the same shared Supabase
 * backend as email/password, so this is purely UI plumbing over
 * src/lib/socialAuth.ts.
 */
export function SocialAuthButtons({
  mode,
  onApple,
  onGoogle,
  loading = false,
  loadingProvider = null,
}: SocialAuthButtonsProps) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    let mounted = true;
    isAppleSignInAvailable().then((available) => {
      if (mounted) setAppleAvailable(available);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View>
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.dividerLabel}>
          or
        </ThemedText>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      {Platform.OS === 'ios' && appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'sign-up'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          // The native button only comes in black/white — pick whichever
          // reads correctly against the current background.
          buttonStyle={
            isDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={TAP_TARGET / 2}
          style={[styles.appleButton, loading && styles.appleButtonDisabled]}
          // The native button has no disabled prop — swallow presses while busy instead.
          onPress={loading ? () => {} : onApple}
        />
      ) : null}

      <Button
        label="Continue with Google"
        variant="outline"
        onPress={onGoogle}
        loading={loading && loadingProvider === 'google'}
        disabled={loading && loadingProvider !== 'google'}
        style={styles.googleButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  line: { flex: 1, height: 1 },
  dividerLabel: { marginHorizontal: spacing.md, ...type.labelSmall },
  appleButton: {
    height: TAP_TARGET,
    marginBottom: spacing.md,
  },
  appleButtonDisabled: { opacity: 0.5 },
  googleButton: { marginBottom: 0 },
});
