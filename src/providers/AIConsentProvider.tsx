import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Button, ThemedText } from '@/components';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';
import { spacing } from '@/theme';

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
 *
 * Apple's first submission was rejected under 5.1.1(i)/5.1.2(i) because the
 * disclosure said only "third-party AI services" — the guideline requires
 * *naming* who receives the data. RECIPIENTS below is that list, and it must
 * stay in step with what the edge functions actually call and with the hosted
 * privacy policy at fancypot.org/privacy (rendered in-app at /legal/privacy).
 */

/** The third parties that actually receive user photos. Named, per 5.1.2(i). */
const RECIPIENTS = [
  {
    name: 'Google (Gemini)',
    detail:
      'Reads the clothing and outfit photos you submit to identify pieces, remove backgrounds, build outfits, and generate try-on images. Reached through the Lovable AI Gateway.',
  },
  {
    name: 'SerpAPI (Google Lens)',
    detail:
      'Receives the outfit photo you snap in Get the Look, to find similar pieces you can shop.',
  },
] as const;
interface AIConsentValue {
  ensureConsent: () => Promise<boolean>;
  hasConsent: boolean;
  /**
   * Flip the grant from Settings. Revoking means the disclosure sheet is shown
   * again before the next AI action — consent has to be withdrawable in-app,
   * not only by emailing support.
   */
  setConsent: (granted: boolean) => Promise<void>;
}

const AIConsentContext = createContext<AIConsentValue | undefined>(undefined);

export function AIConsentProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
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

  const setConsent = useCallback(
    async (granted: boolean) => {
      if (!user) return;
      const prev = (profile?.preferences ?? {}) as Record<string, unknown>;
      const { error } = await supabase
        .from('profiles')
        .update({
          preferences: {
            ...prev,
            ai_consent: granted,
            ai_consent_at: granted ? new Date().toISOString() : null,
          },
        })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
    },
    [user, profile, refreshProfile],
  );

  const decide = useCallback(
    async (agree: boolean) => {
      setVisible(false);
      if (agree) {
        try {
          await setConsent(true);
        } catch {
          // The grant failed to persist. The user did agree, so let this action
          // through — they'll simply be asked again next time.
        }
      }
      resolverRef.current?.(agree);
      resolverRef.current = null;
    },
    [setConsent],
  );

  const value = useMemo<AIConsentValue>(
    () => ({ ensureConsent, hasConsent, setConsent }),
    [ensureConsent, hasConsent, setConsent],
  );

  return (
    <AIConsentContext.Provider value={value}>
      {children}
      <BottomSheet visible={visible} onClose={() => decide(false)} title="AI photo processing">
        {/* Scrollable: the disclosure has to name every recipient, which runs
            longer than a short phone screen can show in one go. The cap scales
            with the viewport — a flat 340 clipped it mid-sentence on iPad,
            where there is room — while keeping both buttons on screen. */}
        <ScrollView style={{ maxHeight: Math.max(300, height * 0.45) }} showsVerticalScrollIndicator={false}>
          <View style={styles.iconRow}>
            <Ionicons name="sparkles" size={20} color={colors.pinkWarm} />
            <ThemedText variant="label" color={colors.ink}>
              Before we send your photo
            </ThemedText>
          </View>
          <ThemedText variant="body" color={colors.inkMuted} style={styles.body}>
            To build looks and run try-ons, Fancy Pot sends the photos you choose to two
            outside services:
          </ThemedText>

          {RECIPIENTS.map((r) => (
            <View key={r.name} style={styles.recipient}>
              <View style={[styles.dot, { backgroundColor: colors.pinkWarm }]} />
              <View style={styles.recipientBody}>
                <ThemedText variant="label" color={colors.ink}>
                  {r.name}
                </ThemedText>
                <ThemedText variant="labelSmall" color={colors.inkMuted}>
                  {r.detail}
                </ThemedText>
              </View>
            </View>
          ))}

          <View style={[styles.callout, { backgroundColor: colors.pinkWarmGlow }]}>
            <Ionicons name="body-outline" size={16} color={colors.ink} />
            <ThemedText variant="labelSmall" color={colors.ink} style={styles.calloutText}>
              Virtual try-on sends a full-body photo of you.
            </ThemedText>
          </View>

          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.body}>
            Only the photo you pick is sent, plus any occasion or vibe you typed. We never
            send your name, email, phone number, payment details, or location. Your photos
            are used only to create the result you asked for — never to train AI models,
            never for advertising, and never to identify you. Both companies are required to
            protect your data to the same standard we do, and keep it only as long as it
            takes to return your result.
          </ThemedText>

          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.body}>
            If you tap Don't Allow, Style Me, Virtual Try-On, Get the Look, and
            automatic photo tagging won't run — you can still browse, build your
            closet, and save looks manually. You can change your answer any time
            in Settings.
          </ThemedText>

          <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={8} style={styles.link}>
            <ThemedText variant="labelSmall" color={colors.blushDeep}>
              Read our Privacy Policy
            </ThemedText>
          </Pressable>
        </ScrollView>
        <Button label="Allow" onPress={() => decide(true)} />
        <View style={{ height: spacing.sm }} />
        <Button label="Don't Allow" variant="ghost" onPress={() => decide(false)} />
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
  recipient: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  recipientBody: { flex: 1, gap: 2 },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    marginBottom: spacing.md,
  },
  calloutText: { flex: 1 },
  link: { alignSelf: 'flex-start', marginBottom: spacing.lg },
});
