import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StackHeader, Button, ResponsiveContent, TextField, ThemedText } from '@/components';
import { spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase } from '@/lib/supabase';

/**
 * Change the signed-in user's password. Supabase's updateUser only needs an
 * active session (no current-password re-entry), so this is a simple two-field
 * confirm form. Users who signed up with Apple/Google have no password to
 * change — updateUser would set one, which is fine (it adds email+password as
 * a second way in to the same account).
 */
export default function ChangePassword() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;
  const canSave = password.length >= 8 && password === confirm && !saving;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('Password updated', 'Use your new password next time you sign in.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not update password', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Change password" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContent maxWidth={520}>
          <ThemedText variant="body" color={colors.inkMuted} style={styles.intro}>
            Pick a new password of at least 8 characters. You'll stay signed in on this device.
          </ThemedText>
          <TextField
            label="New password"
            secure
            value={password}
            onChangeText={setPassword}
            error={tooShort ? 'At least 8 characters.' : undefined}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TextField
            label="Confirm new password"
            secure
            value={confirm}
            onChangeText={setConfirm}
            error={mismatch ? "Passwords don't match." : undefined}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </ResponsiveContent>
      </ScrollView>
      <View style={styles.footer}>
        <ResponsiveContent maxWidth={520}>
          <Button label="Update password" onPress={save} loading={saving} disabled={!canSave} />
        </ResponsiveContent>
      </View>
    </View>
  );
}

// Was a static StyleSheet bound to the light palette — the one screen that
// didn't follow dark mode. Now themed like everything else.
const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { padding: spacing.lg, gap: spacing.lg },
    intro: { marginBottom: spacing.sm },
    footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.border },
  });
