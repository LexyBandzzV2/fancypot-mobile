import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, TextField, ThemedText, Wordmark } from '@/components';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 6) {
      setError('Use a valid email and a password of at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email.trim(), password);
      if (needsConfirmation) {
        setNotice('Check your inbox to confirm your email, then sign in.');
      }
      // If confirmation is off, the session appears and the guard redirects.
    } catch (e: any) {
      setError(e?.message ?? 'Could not create your account. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll edgeTop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View style={styles.header}>
          <Wordmark size={44} />
          <ThemedText variant="h3" color={colors.inkMuted} center style={styles.sub}>
            Create your account
          </ThemedText>
        </View>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="you@email.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="At least 6 characters"
          error={error}
        />

        {notice ? (
          <View style={styles.notice}>
            <Ionicons name="mail-outline" size={18} color={colors.success} />
            <ThemedText variant="labelSmall" color={colors.success} style={styles.noticeText}>
              {notice}
            </ThemedText>
          </View>
        ) : null}

        <Button label="Create account" onPress={onSubmit} loading={loading} />

        <ThemedText
          variant="labelSmall"
          color={colors.inkMuted}
          center
          style={styles.terms}
        >
          By continuing you agree to our Terms and Privacy Policy.
        </ThemedText>

        <View style={styles.footer}>
          <ThemedText variant="body" color={colors.inkMuted}>
            Already have an account?{' '}
          </ThemedText>
          <Pressable onPress={() => router.replace('/(auth)/sign-in')} hitSlop={8}>
            <ThemedText variant="body" color={colors.pinkWarm}>
              Sign in
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', marginBottom: spacing.md, marginTop: spacing.md },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  sub: { marginTop: spacing.xs },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#E7F2EA',
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  noticeText: { flex: 1 },
  terms: { marginTop: spacing.md },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
