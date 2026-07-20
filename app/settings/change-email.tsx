import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StackHeader, Button, TextField, ThemedText } from '@/components';
import { spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

// Simple, permissive email shape check — the real validation is Supabase's.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Change the signed-in user's email. Supabase sends a confirmation link to the
 * NEW address (and, depending on project settings, the old one); the change
 * only takes effect once that link is clicked, so we tell the user to check
 * their inbox rather than pretending it's done.
 */
export default function ChangeEmail() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const current = user?.email ?? '';
  const trimmed = email.trim();
  const valid = EMAIL_RE.test(trimmed) && trimmed.toLowerCase() !== current.toLowerCase();
  const showFormatError = trimmed.length > 0 && !EMAIL_RE.test(trimmed);
  const showSameError =
    trimmed.length > 0 && EMAIL_RE.test(trimmed) && trimmed.toLowerCase() === current.toLowerCase();

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: 'fancypot://' },
      );
      if (error) throw error;
      Alert.alert(
        'Confirm your new email',
        `We sent a confirmation link to ${trimmed}. Tap it to finish changing your email. Until then, keep using your current email to sign in.`,
        [{ text: 'Got it', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Could not update email', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Change email" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText variant="body" color={colors.inkMuted} style={styles.intro}>
          {current
            ? `You're signed in as ${current}. Enter a new email and we'll send a confirmation link to it.`
            : "Enter a new email and we'll send a confirmation link to it."}
        </ThemedText>
        <TextField
          label="New email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="you@example.com"
          error={
            showFormatError
              ? 'Enter a valid email.'
              : showSameError
                ? "That's already your email."
                : undefined
          }
        />
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Send confirmation link" onPress={save} loading={saving} disabled={!valid || saving} />
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { padding: spacing.lg, gap: spacing.lg },
    intro: { marginBottom: spacing.sm },
    footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.border },
  });
