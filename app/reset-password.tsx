import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, TextField, ThemedText, Wordmark } from '@/components';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

/**
 * Reached via the password-reset deep link (see useAuthDeepLinks). A recovery
 * session is already active, so we just set the new password.
 */
export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('Password updated', 'You can now use your new password.');
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message ?? 'Could not update your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll edgeTop>
      <View style={styles.header}>
        <Wordmark size={40} />
        <ThemedText variant="h3" color={colors.inkMuted} center style={styles.sub}>
          Set a new password
        </ThemedText>
      </View>
      <TextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secure
        textContentType="newPassword"
        placeholder="At least 6 characters"
      />
      <TextField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secure
        placeholder="Re-enter password"
        error={error}
      />
      <Button label="Update password" onPress={onSubmit} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginVertical: spacing.xl },
  sub: { marginTop: spacing.xs },
});
