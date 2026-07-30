import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ResponsiveContent, Screen, ThemedText } from '@/components';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { spacing } from '@/theme';

/**
 * One-time Terms + privacy disclosure, shown once per account before the app is
 * usable. Written to satisfy Apple 5.1.1(i): the app must identify what data it
 * collects, how it collects it, every use of that data, and confirm that each
 * third party it shares with provides the same or equal protection.
 *
 * This screen does NOT replace the per-feature AI consent prompts in
 * AIConsentProvider — Apple's rejection is explicit that a blanket agreement is
 * not sufficient on its own ("only including this information in the app's Terms
 * of Service or Privacy Policy is not sufficient"). The two work together: this
 * is the up-front full disclosure, and the per-feature sheet is the affirmative
 * opt-in at the moment data is actually sent.
 *
 * Bump ACCEPTED_VERSION when the disclosure materially changes — every existing
 * account is then asked again on next launch.
 */
export const ACCEPTED_VERSION = '2026-07-30';

/** The named recipients, each with what they get and why. Keep in step with
 *  AI_FEATURES in AIConsentProvider and with fancypot.org/privacy. */
const RECIPIENTS: { name: string; gets: string }[] = [
  {
    name: 'Google (Gemini AI models, via the Lovable AI Gateway)',
    gets: 'Photos you submit to background removal, Style Me, Virtual Try-On, and recommendations — plus the occasion and vibe text you type.',
  },
  {
    name: 'SerpAPI (runs a Google Lens reverse-image search)',
    gets: 'The outfit photo you submit to Get the Look.',
  },
  {
    name: 'Supabase',
    gets: 'Hosts your account, your closet photos, and your saved looks.',
  },
  {
    name: 'RevenueCat',
    gets: 'Your subscription status, so the app knows which plan you are on.',
  },
  {
    name: 'Apple',
    gets: 'Handles all payments. We never see or store your card details.',
  },
  {
    name: 'Sentry',
    gets: 'Crash and error reports, so we can fix bugs. No photos are included.',
  },
];

export default function AcceptTerms() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const prev = (profile?.preferences ?? {}) as Record<string, unknown>;
      const { error } = await supabase
        .from('profiles')
        .update({
          preferences: {
            ...prev,
            terms_accepted_at: new Date().toISOString(),
            terms_version: ACCEPTED_VERSION,
          },
        })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      // The root guard sends them on to (tabs) once the flag lands; replace so
      // this screen can never be reached with the back gesture.
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert(
        'Could not save',
        e?.message ?? 'We could not record your agreement. Please check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  // Declining is a legitimate answer — it just means the account cannot be used,
  // so we sign out rather than trapping them on this screen.
  const decline = () => {
    Alert.alert(
      'Decline and sign out?',
      'Fancy Pot needs these terms accepted to run. You can sign back in and accept any time.',
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  return (
    <Screen scroll edgeTop>
      <ResponsiveContent maxWidth={620}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark-outline" size={34} color={colors.pinkWarm} />
          <ThemedText variant="h1" center style={styles.title}>
            Before you start
          </ThemedText>
          <ThemedText variant="body" color={colors.inkMuted} center style={styles.sub}>
            Fancy Pot uses AI to style your closet. Here is exactly what that means for
            your data. Please read this — you need to agree before using the app.
          </ThemedText>
        </View>

        <Card glass={false} style={styles.section}>
          <ThemedText variant="label" color={colors.ink} style={styles.heading}>
            What we collect
          </ThemedText>
          <Bullet>Your email address, and a display name if you set one.</Bullet>
          <Bullet>
            Your phone number, only if you choose to verify it. Verification is optional.
          </Bullet>
          <Bullet>
            The photos you upload: clothing pieces for your closet, outfit photos, and — only
            for Virtual Try-On — a full-body photo of yourself.
          </Bullet>
          <Bullet>
            Style preferences you set: styles, stores, budget, occasions, and the text you
            type when asking for a look.
          </Bullet>
          <Bullet>
            Usage counts (how many outfits, try-ons, and closet items you have used) so we
            can apply your plan limits.
          </Bullet>
        </Card>

        <Card glass={false} style={styles.section}>
          <ThemedText variant="label" color={colors.ink} style={styles.heading}>
            How we collect it
          </ThemedText>
          <Bullet>
            Directly from you — when you type something, pick a photo, or take one with the
            camera. Nothing is read from your photo library unless you choose that photo.
          </Bullet>
          <Bullet>
            Automatically as you use the app — only the usage counts described above.
          </Bullet>
          <Bullet>
            We do not track you across other apps or websites, and we do not buy data about
            you from anyone else.
          </Bullet>
        </Card>

        <Card glass={false} style={styles.section}>
          <ThemedText variant="label" color={colors.ink} style={styles.heading}>
            How we use it
          </ThemedText>
          <Bullet>To produce the exact result you asked for — the look, the try-on, the match.</Bullet>
          <Bullet>To save your closet, your looks, and your preferences to your account.</Bullet>
          <Bullet>To apply the limits of your plan and to process your subscription.</Bullet>
          <Bullet>To fix crashes and keep the service secure.</Bullet>
          <Bullet>
            We never sell your data. We never use your photos to train AI models. We never
            use your photos for advertising or to identify you.
          </Bullet>
        </Card>

        <Card glass={false} style={styles.section}>
          <ThemedText variant="label" color={colors.ink} style={styles.heading}>
            Who we share it with
          </ThemedText>
          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.para}>
            AI styling only works by sending your photo to an AI provider. These are every
            company that receives any part of your data, and what each one gets:
          </ThemedText>
          {RECIPIENTS.map((r) => (
            <View key={r.name} style={styles.recipient}>
              <ThemedText variant="labelSmall" color={colors.ink}>
                {r.name}
              </ThemedText>
              <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.recipientGets}>
                {r.gets}
              </ThemedText>
            </View>
          ))}
          <View style={[styles.callout, { backgroundColor: colors.pinkWarmGlow }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.ink} />
            <ThemedText variant="labelSmall" color={colors.ink} style={styles.calloutText}>
              Google, Lovable Labs, SerpAPI, Supabase, RevenueCat, and Sentry act as our
              processors under contract, and are contractually bound to provide the same or
              an equivalent level of protection for your data as this disclosure and our
              Privacy Policy describe: to use it only to perform the service we asked them
              for, not to train their models on it, not to sell it, and not to keep it
              longer than that request needs. Apple processes payments under Apple's own
              privacy policy — we never see your card details.
            </ThemedText>
          </View>
        </Card>

        <Card glass={false} style={styles.section}>
          <ThemedText variant="label" color={colors.ink} style={styles.heading}>
            You stay in control
          </ThemedText>
          <Bullet>
            Agreeing here does not send anything yet. Before any AI feature runs for the
            first time, that feature asks you separately — naming what it sends and who
            receives it — and you can say no.
          </Bullet>
          <Bullet>
            A feature you decline simply stays off. The rest of the app keeps working.
          </Bullet>
          <Bullet>
            You can withdraw AI permission at any time in Settings → Account, which clears
            every feature at once.
          </Bullet>
          <Bullet>
            You can delete your account from Settings, which erases your photos, looks, and
            profile.
          </Bullet>
        </Card>

        <View style={styles.links}>
          <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={8}>
            <ThemedText variant="label" color={colors.blushDeep}>
              Read the full Privacy Policy
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => router.push('/legal/terms')} hitSlop={8}>
            <ThemedText variant="label" color={colors.blushDeep}>
              Read the full Terms of Use
            </ThemedText>
          </Pressable>
        </View>

        <Button
          label="I Agree and Continue"
          onPress={accept}
          loading={saving}
          icon={!saving ? <Ionicons name="checkmark" size={18} color={colors.cream} /> : undefined}
        />
        <View style={{ height: spacing.sm }} />
        <Button label="Decline" variant="ghost" onPress={decline} disabled={saving} />
        <View style={{ height: spacing.xxxl }} />
      </ResponsiveContent>
    </Screen>
  );
}

/** Disclosure bullet — a dot column so long lines wrap flush, not under the dot. */
function Bullet({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.bullet}>
      <ThemedText variant="labelSmall" color={colors.pinkWarm}>
        •
      </ThemedText>
      <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.bulletText}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xl },
  title: { marginTop: spacing.sm },
  sub: { marginTop: spacing.sm },
  section: { marginBottom: spacing.lg, gap: spacing.xs },
  heading: { marginBottom: spacing.xs },
  para: { marginBottom: spacing.sm },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  bulletText: { flex: 1, lineHeight: 20 },
  recipient: { marginBottom: spacing.sm },
  recipientGets: { marginTop: 2, lineHeight: 20 },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    marginTop: spacing.xs,
  },
  calloutText: { flex: 1, lineHeight: 20 },
  links: { gap: spacing.md, marginBottom: spacing.xl, alignItems: 'center' },
});
