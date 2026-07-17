import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Screen, SocialAuthButtons, TextField, ThemedText, Wordmark } from '@/components';
import { useAuth } from '@/providers/AuthProvider';
import { signInWithApple, signInWithGoogle } from '@/lib/socialAuth';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithPassword(email.trim(), password);
      // Redirect handled by the root protected-route guard.
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign in. Check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const onAppleSignIn = async () => {
    setError(null);
    setSocialLoading('apple');
    try {
      // Existing users are already verified — a session here is enough,
      // the root protected-route guard handles the rest.
      await signInWithApple();
    } catch (e: any) {
      Alert.alert('Apple sign-in failed', e?.message ?? 'Please try again.');
    } finally {
      setSocialLoading(null);
    }
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setSocialLoading('google');
    try {
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Google sign-in failed', e?.message ?? 'Please try again.');
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <Screen scroll edgeTop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.back, { marginTop: insets.top ? 0 : spacing.md }]}
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View style={styles.header}>
          <Wordmark size={44} />
          <ThemedText variant="h3" color={colors.inkMuted} center style={styles.sub}>
            Welcome back
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
          autoComplete="password"
          textContentType="password"
          placeholder="Your password"
          error={error}
        />

        <Pressable
          onPress={() => router.push('/(auth)/forgot-password')}
          style={styles.forgot}
          hitSlop={8}
        >
          <ThemedText variant="label" color={colors.blushDeep}>
            Forgot password?
          </ThemedText>
        </Pressable>

        <Button
          label="Sign in"
          onPress={onSubmit}
          loading={loading}
          disabled={socialLoading !== null}
        />

        <SocialAuthButtons
          mode="sign-in"
          onApple={onAppleSignIn}
          onGoogle={onGoogleSignIn}
          loading={loading || socialLoading !== null}
          loadingProvider={socialLoading}
        />

        <View style={styles.footer}>
          <ThemedText variant="body" color={colors.inkMuted}>
            New here?{' '}
          </ThemedText>
          <Pressable onPress={() => router.replace('/(auth)/sign-up')} hitSlop={8}>
            <ThemedText variant="body" color={colors.pinkWarm}>
              Create an account
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', marginBottom: spacing.md },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  sub: { marginTop: spacing.xs },
  forgot: { alignSelf: 'flex-end', marginBottom: spacing.lg },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
