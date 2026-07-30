import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { isAppleSignInAvailable } from '@/lib/socialAuth';
import { spacing, TAP_TARGET, type } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemedText } from './Typography';

interface SocialAuthButtonsProps {
  mode: 'sign-in' | 'sign-up';
  onApple: () => void | Promise<void>;
  /** Disables the button while any auth request (social or password) is in flight. */
  loading?: boolean;
}

/**
 * Shared "or" divider + native Sign in with Apple button for the sign-in and
 * sign-up screens. Apple is the only third-party sign-in the app offers, and it
 * lands in the same shared Supabase backend as email/password, so this is
 * purely UI plumbing over src/lib/socialAuth.ts.
 */
export function SocialAuthButtons({ mode, onApple, loading = false }: SocialAuthButtonsProps) {
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

  // Apple is the only provider, so until the availability check resolves (and
  // anywhere it comes back false) there is nothing to introduce — and a bare
  // "or" divider would float above empty space.
  if (!appleAvailable) return null;

  return (
    <View>
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.dividerLabel}>
          or
        </ThemedText>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

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
  appleButton: { height: TAP_TARGET },
  appleButtonDisabled: { opacity: 0.5 },
});
