import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, TextField, ThemedText } from '@/components';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

export default function ForgotPassword() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll edgeTop>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <ThemedText variant="h1" style={styles.title}>
        Reset password
      </ThemedText>
      <ThemedText variant="body" color={colors.inkMuted} style={styles.body}>
        Enter your email and we'll send you a link to set a new password.
      </ThemedText>

      {sent ? (
        <View
          style={[
            styles.success,
            { backgroundColor: isDark ? 'rgba(92, 179, 126, 0.16)' : '#E7F2EA' },
          ]}
        >
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          <ThemedText variant="body" color={colors.success} style={styles.successText}>
            Sent. Check your inbox for the reset link.
          </ThemedText>
        </View>
      ) : (
        <>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@email.com"
            error={error}
          />
          <Button label="Send reset link" onPress={onSubmit} loading={loading} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', marginTop: spacing.md, marginBottom: spacing.lg },
  title: { marginBottom: spacing.sm },
  body: { marginBottom: spacing.xl },
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 16,
  },
  successText: { flex: 1 },
});
