import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Button, ThemedText } from '@/components';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { colors, spacing } from '@/theme';

/**
 * AI data-sharing consent.
 *
 * Fancy Pot's AI features send the user's photos to third-party AI services
 * (via Supabase Edge Functions). Apple 5.1.2(i) and Google Play's Prominent
 * Disclosure & Consent policy require an explicit, in-app disclosure and
 * affirmative consent BEFORE that sharing happens — a privacy-policy line alone
 * is not enough. `ensureConsent()` resolves immediately if already granted,
 * otherwise it shows the disclosure sheet and resolves with the user's choice.
 * The grant is stored on `profiles.preferences.ai_consent` so it persists across
 * web, iOS and Android.
 */
interface AIConsentValue {
  ensureConsent: () => Promise<boolean>;
  hasConsent: boolean;
}

const AIConsentContext = createContext<AIConsentValue | undefined>(undefined);

export function AIConsentProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const hasConsent = !!(profile?.preferences as { ai_consent?: boolean } | null)?.ai_consent;

  const ensureConsent = useCallback(async () => {
    if (hasConsent) return true;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setVisible(true);
    });
  }, [hasConsent]);

  const decide = useCallback(
    async (agree: boolean) => {
      setVisible(false);
      if (agree && user) {
        const prev = (profile?.preferences ?? {}) as Record<string, unknown>;
        await supabase
          .from('profiles')
          .update({
            preferences: { ...prev, ai_consent: true, ai_consent_at: new Date().toISOString() },
          })
          .eq('user_id', user.id);
        await refreshProfile();
      }
      resolverRef.current?.(agree);
      resolverRef.current = null;
    },
    [user, profile, refreshProfile],
  );

  const value = useMemo<AIConsentValue>(
    () => ({ ensureConsent, hasConsent }),
    [ensureConsent, hasConsent],
  );

  return (
    <AIConsentContext.Provider value={value}>
      {children}
      <BottomSheet visible={visible} onClose={() => decide(false)} title="AI photo processing">
        <View style={styles.iconRow}>
          <Ionicons name="sparkles" size={20} color={colors.pinkWarm} />
          <ThemedText variant="label" color={colors.ink}>
            Before we style you
          </ThemedText>
        </View>
        <ThemedText variant="body" color={colors.inkMuted} style={styles.body}>
          To analyze outfits, build looks, and run virtual try-ons, Fancy Pot sends the
          photos you choose to secure third-party AI services. Your images are used only to
          create these results for you — never to train models, advertise, or identify you.
        </ThemedText>
        <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={8} style={styles.link}>
          <ThemedText variant="labelSmall" color={colors.blushDeep}>
            Read our Privacy Policy
          </ThemedText>
        </Pressable>
        <Button label="Agree & continue" onPress={() => decide(true)} />
        <View style={{ height: spacing.sm }} />
        <Button label="Not now" variant="ghost" onPress={() => decide(false)} />
      </BottomSheet>
    </AIConsentContext.Provider>
  );
}

export function useAIConsent(): AIConsentValue {
  const ctx = useContext(AIConsentContext);
  if (!ctx) throw new Error('useAIConsent must be used within an AIConsentProvider');
  return ctx;
}

const styles = StyleSheet.create({
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  body: { marginBottom: spacing.md },
  link: { alignSelf: 'flex-start', marginBottom: spacing.lg },
});
