import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, TextField, ThemedText } from '@/components';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';

/**
 * Phone verification. Mirrors the web flow: a secondary trust gate on top of an
 * already-authenticated account (custom OTP via the phone-send-code /
 * phone-verify-code edge functions — not Supabase native phone auth).
 */
export default function VerifyPhone() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    if (!phone.trim()) {
      setError('Enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('phone-send-code', {
        body: { phone: phone.trim() },
      });
      if (error) throw error;
      setStep('code');
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the code.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (code.length < 4) {
      setError('Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('phone-verify-code', {
        body: { phone: phone.trim(), code: code.trim() },
      });
      if (error) throw error;
      await refreshProfile();
      Alert.alert('Verified', 'Your phone number is verified.');
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'That code was not correct.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll edgeTop>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
        <Ionicons name="close" size={26} color={colors.ink} />
      </Pressable>
      <ThemedText variant="h1" style={styles.title}>
        Verify your phone
      </ThemedText>
      <ThemedText variant="body" color={colors.inkMuted} style={styles.body}>
        {step === 'phone'
          ? 'We use this to keep AI features fair and secure.'
          : `Enter the code we sent to ${phone}.`}
      </ThemedText>

      {step === 'phone' ? (
        <>
          <TextField
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+1 555 000 0000"
            error={error}
          />
          <Button label="Send code" onPress={sendCode} loading={loading} />
        </>
      ) : (
        <>
          <TextField
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            placeholder="123456"
            maxLength={6}
            error={error}
          />
          <Button label="Verify" onPress={verify} loading={loading} />
          <Pressable onPress={() => setStep('phone')} style={styles.resend} hitSlop={8}>
            <ThemedText variant="label" color={colors.blushDeep}>
              Change number
            </ThemedText>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: { alignSelf: 'flex-end', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { marginBottom: spacing.sm },
  body: { marginBottom: spacing.xl },
  resend: { alignSelf: 'center', marginTop: spacing.lg },
});
