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
 * AI data-sharing consent, asked separately for each feature.
 *
 * Apple 5.1.2(i) requires an in-app disclosure naming who receives the data and
 * an affirmative opt-in BEFORE anything is transmitted. Apple's own rejection
 * text is explicit that a privacy policy or a blanket terms-of-service
 * agreement does NOT satisfy this ("only including this information in the
 * app's Terms of Service or Privacy Policy is not sufficient") — the prompt has
 * to appear at the point of sharing, which is what this provider does.
 *
 * Consent is per FEATURE, not global. Agreeing to background removal on a
 * clothing photo is not agreement to send a full-body photo for virtual try-on,
 * and the two go to the request for different purposes. Each feature therefore
 * states its own "what we send / who gets it" and is remembered independently
 * once granted, so a user is asked at most once per feature.
 *
 * Storage lives on the SHARED `profiles.preferences` jsonb so it survives
 * reinstall and stays visible to the web app:
 *   - preferences.ai_feature_consent : { [feature]: ISO timestamp of the grant }
 *   - preferences.ai_consent         : legacy global flag the web app reads;
 *                                      kept true while any feature is granted
 *   - preferences.ai_consent_at      : timestamp of the first grant
 */

export type AIFeature = 'wardrobe' | 'stylist' | 'tryOn' | 'getTheLook' | 'recommend';

interface FeatureCopy {
  icon: keyof typeof Ionicons.glyphMap;
  /** Sheet title — phrased as the permission being asked for. */
  title: string;
  /** One line on what is about to happen. */
  lead: string;
  /** Exactly what leaves the device for this feature. */
  sent: string;
  /** Named recipient(s) — required by 5.1.2(i). */
  recipient: string;
  /** Shown as an extra warning callout when the data is especially sensitive. */
  sensitive?: string;
}

/**
 * Per-feature disclosure copy. `recipient` must stay in step with what the edge
 * functions actually call and with the hosted policy at fancypot.org/privacy.
 */
export const AI_FEATURES: Record<AIFeature, FeatureCopy> = {
  wardrobe: {
    icon: 'shirt-outline',
    title: 'Allow AI background removal?',
    lead: 'To add this piece to your closet, we use AI to identify the garment and cut out the background.',
    sent: 'The clothing photo you just picked — nothing else.',
    recipient: 'Google, using its Gemini AI models, reached through the Lovable AI Gateway.',
  },
  stylist: {
    icon: 'sparkles-outline',
    title: 'Allow AI outfit styling?',
    lead: 'To build your look, we send your selected pieces to an AI stylist.',
    sent: 'Photos of the closet pieces you picked, plus the occasion and vibe you typed.',
    recipient: 'Google, using its Gemini AI models, reached through the Lovable AI Gateway.',
  },
  tryOn: {
    icon: 'body-outline',
    title: 'Allow AI virtual try-on?',
    lead: 'To show the outfit on you, we send your photo to an AI image model.',
    sent: 'The full-body photo of yourself that you chose, plus the outfit image.',
    recipient: 'Google, using its Gemini AI models, reached through the Lovable AI Gateway.',
    sensitive: 'This sends a full-body photo of you. It is only ever sent when you tap Dress me.',
  },
  getTheLook: {
    icon: 'search-outline',
    title: 'Allow AI look matching?',
    lead: 'To find pieces you can shop, we run a reverse-image search on the outfit photo.',
    sent: 'The outfit photo you snapped or uploaded.',
    recipient: 'SerpAPI, which runs a Google Lens reverse-image search.',
  },
  recommend: {
    icon: 'pricetags-outline',
    title: 'Allow AI piece recommendations?',
    lead: 'To suggest pieces that complete this look, we send the outfit photo to an AI stylist.',
    sent: 'The saved outfit photo, plus your saved style and store preferences.',
    recipient: 'Google, using its Gemini AI models, reached through the Lovable AI Gateway.',
  },
};

type FeatureGrants = Partial<Record<AIFeature, string>>;

interface AIConsentValue {
  /**
   * Resolve true once the user has agreed to AI processing for `feature`,
   * showing the disclosure first if they haven't. Resolves false if they
   * decline — callers must not transmit anything in that case.
   */
  ensureConsent: (feature: AIFeature) => Promise<boolean>;
  /** Whether `feature` is already granted, without prompting. */
  hasConsent: (feature: AIFeature) => boolean;
  /** True when at least one feature is granted (drives the Settings toggle). */
  anyConsent: boolean;
  /**
   * Master switch for Settings. Revoking clears every per-feature grant, so the
   * disclosure is shown again before the next AI action — consent has to be
   * withdrawable in-app, not only by emailing support.
   */
  setConsent: (granted: boolean) => Promise<void>;
}

const AIConsentContext = createContext<AIConsentValue | undefined>(undefined);

export function AIConsentProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const { user, profile, refreshProfile } = useAuth();
  const [pending, setPending] = useState<AIFeature | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const prefs = (profile?.preferences ?? {}) as {
    ai_consent?: boolean;
    ai_consent_at?: string | null;
    ai_feature_consent?: FeatureGrants;
  };
  const grants = prefs.ai_feature_consent ?? {};
  const anyConsent = Object.keys(grants).length > 0;

  const hasConsent = useCallback(
    (feature: AIFeature) => !!grants[feature],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(grants)],
  );

  /** Read-modify-write so no other preference keys are disturbed. */
  const writeGrants = useCallback(
    async (next: FeatureGrants) => {
      if (!user) return;
      const prev = (profile?.preferences ?? {}) as Record<string, unknown>;
      const any = Object.keys(next).length > 0;
      const { error } = await supabase
        .from('profiles')
        .update({
          preferences: {
            ...prev,
            ai_feature_consent: next,
            // Keep the global flag the web app reads in step with the per-feature
            // grants, so the two platforms never disagree about whether the user
            // has opted in at all.
            ai_consent: any,
            ai_consent_at: any ? (prefs.ai_consent_at ?? new Date().toISOString()) : null,
          },
        })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
    },
    [user, profile, refreshProfile, prefs.ai_consent_at],
  );

  const ensureConsent = useCallback(
    async (feature: AIFeature) => {
      if (hasConsent(feature)) return true;
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setPending(feature);
      });
    },
    [hasConsent],
  );

  const setConsent = useCallback(
    async (granted: boolean) => {
      // Granting from Settings opts into every feature at once; the user is
      // looking at the list of recipients on that screen when they do it.
      await writeGrants(
        granted
          ? (Object.fromEntries(
              (Object.keys(AI_FEATURES) as AIFeature[]).map((f) => [f, new Date().toISOString()]),
            ) as FeatureGrants)
          : {},
      );
    },
    [writeGrants],
  );

  const decide = useCallback(
    async (agree: boolean) => {
      const feature = pending;
      setPending(null);
      if (agree && feature) {
        try {
          await writeGrants({ ...grants, [feature]: new Date().toISOString() });
        } catch {
          // The grant failed to persist. The user did agree, so let this action
          // through — they'll simply be asked again next time.
        }
      }
      resolverRef.current?.(agree);
      resolverRef.current = null;
    },
    [pending, grants, writeGrants],
  );

  const value = useMemo<AIConsentValue>(
    () => ({ ensureConsent, hasConsent, anyConsent, setConsent }),
    [ensureConsent, hasConsent, anyConsent, setConsent],
  );

  const copy = pending ? AI_FEATURES[pending] : null;

  return (
    <AIConsentContext.Provider value={value}>
      {children}
      <BottomSheet
        visible={pending !== null}
        onClose={() => decide(false)}
        title={copy?.title ?? ''}
      >
        {copy ? (
          <>
            {/* Scales with the viewport: a flat cap clipped the disclosure
                mid-sentence on iPad, while both buttons must stay on screen. */}
            <ScrollView
              style={{ maxHeight: Math.max(260, height * 0.42) }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.iconRow}>
                <Ionicons name={copy.icon} size={20} color={colors.pinkWarm} />
                <ThemedText variant="body" color={colors.ink} style={styles.lead}>
                  {copy.lead}
                </ThemedText>
              </View>

              <ThemedText variant="label" color={colors.ink} style={styles.heading}>
                What we send
              </ThemedText>
              <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.body}>
                {copy.sent}
              </ThemedText>

              <ThemedText variant="label" color={colors.ink} style={styles.heading}>
                Who receives it
              </ThemedText>
              <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.body}>
                {copy.recipient}
              </ThemedText>

              {copy.sensitive ? (
                <View style={[styles.callout, { backgroundColor: colors.pinkWarmGlow }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.ink} />
                  <ThemedText variant="labelSmall" color={colors.ink} style={styles.calloutText}>
                    {copy.sensitive}
                  </ThemedText>
                </View>
              ) : null}

              <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.body}>
                We never send your name, email, phone number, payment details, or location.
                Your photo is used only to create the result you asked for — never to train
                AI models, never for advertising, and never to identify you.
              </ThemedText>

              <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={8} style={styles.link}>
                <ThemedText variant="labelSmall" color={colors.blushDeep}>
                  Read our Privacy Policy for full details on what we share and with whom
                </ThemedText>
              </Pressable>

              <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.body}>
                This is the only way this feature can work — without your permission we
                cannot send the image, so there is nothing for it to give back. Tap Don't
                Allow and it simply stays off; the rest of the app keeps working, and you
                can change your answer any time in Settings.
              </ThemedText>
            </ScrollView>
            <Button label="Allow" onPress={() => decide(true)} />
            <View style={{ height: spacing.sm }} />
            <Button label="Don't Allow" variant="ghost" onPress={() => decide(false)} />
          </>
        ) : null}
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
  iconRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  lead: { flex: 1 },
  heading: { marginBottom: spacing.xs },
  body: { marginBottom: spacing.md },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    marginBottom: spacing.md,
  },
  calloutText: { flex: 1 },
  link: { alignSelf: 'flex-start', marginBottom: spacing.md },
});
