import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { StackHeader, Button, TextField, ThemedText, Card } from '@/components';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

/**
 * In-app account deletion — required for App Store / Play Store approval.
 * Calls the `delete-account` edge function (service-role) which erases the
 * user's rows + storage and deletes the auth user, then signs out locally.
 */
export default function DeleteAccount() {
  const { signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onDelete = async () => {
    if (confirm.trim().toUpperCase() !== 'DELETE') {
      Alert.alert('Type DELETE to confirm.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) throw error;
      await signOut();
      Alert.alert('Account deleted', 'Your account and data have been removed.');
    } catch (e: any) {
      Alert.alert('Could not delete account', e?.message ?? 'Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Delete account" />
      <View style={styles.content}>
        <Card>
          <ThemedText variant="h3" color={colors.danger}>
            This can't be undone
          </ThemedText>
          <ThemedText variant="body" color={colors.inkMuted} style={styles.body}>
            Deleting your account permanently removes your closet, saved outfits, preferences,
            and history from Fancy Pot. Any active subscription must be cancelled separately in
            your App Store / Google Play account.
          </ThemedText>
        </Card>

        <View style={styles.confirm}>
          <TextField
            label="Type DELETE to confirm"
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            placeholder="DELETE"
          />
          <Button
            label="Permanently delete my account"
            variant="primary"
            onPress={onDelete}
            loading={loading}
            style={{ backgroundColor: colors.danger, borderColor: colors.danger }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg },
  body: { marginTop: spacing.sm },
  confirm: { marginTop: spacing.xl },
});
