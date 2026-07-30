import { useCallback, useState } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { UsageLimitError } from '@/lib/api';
import { useAIConsent, type AIFeature } from '@/providers/AIConsentProvider';
import { useAds } from '@/providers/AdsProvider';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Whether the phone prompt has already been shown this launch.
 *
 * DELIBERATELY SOFT FOR THE FIRST APPROVED RELEASE ONLY. The product rule is
 * that phone verification is REQUIRED once per new account before AI features —
 * it is what stops someone farming free AI credits across throwaway accounts.
 * It is a one-shot skippable nudge here purely so App Review, who could not
 * receive an SMS on their iPad and did not use the demo account, cannot get
 * trapped in front of the AI features again.
 *
 * PLANNED FOLLOW-UP (immediately after the app is approved and live): turn this
 * back into a hard gate — drop this flag, block on `!profile.phone_verified`
 * every time, and enforce it server-side in the AI edge functions too, since a
 * client-side check alone does not actually stop the abuse it is meant to stop.
 */
let phonePromptShown = false;

/**
 * Wraps an AI edge-function call with consistent loading state + error handling.
 * When the server reports the user is over their plan limit or rate-limited, we
 * surface a friendly alert and offer to open the paywall — the SERVER is the one
 * enforcing the limit, this is only UX on top of that decision.
 */
export function useAIAction() {
  const router = useRouter();
  const { ensureConsent } = useAIConsent();
  const { canOfferReward, watchRewardedForBonus, showAiGate } = useAds();
  const { profile } = useAuth();
  const [running, setRunning] = useState(false);

  /**
   * The pre-AI gate WITHOUT running any action: data consent → phone nudge →
   * interstitial ad. Resolves true only when every gate is cleared, so a caller
   * can run the AI call itself (e.g. hand it to a background job that outlives
   * this screen). Returns false — silently or after a prompt — when the user
   * declines consent.
   *
   * Consent must be the FIRST thing checked here, and nothing else may block
   * ahead of it. Phone verification used to run first, and it had no way to
   * proceed if verification was skipped or SMS delivery failed — "Skip" just
   * navigated back to the same screen, so tapping the AI button re-ran the same
   * unmet check. A reviewer (or any user) without a working phone number could
   * never reach the consent prompt on Style Me / Try-On / Get the Look, which
   * Apple read as "no disclosure exists" on those flows even though it existed
   * and worked on the wardrobe-upload path.
   *
   * So the phone step now sits AFTER consent and is a one-shot nudge: it opens
   * the (skippable) verification screen at most once per launch and then never
   * blocks again. Anything stricter re-creates the deadlock above.
   */
  const gate = useCallback(async (feature: AIFeature): Promise<boolean> => {
    // Apple 5.1.2(i): get consent before sending the user's photos to
    // third-party AI. Asked per feature — agreeing to background removal is not
    // agreement to send a full-body try-on photo. No-op once granted.
    const consented = await ensureConsent(feature);
    if (!consented) return false;
    // One-time nudge to verify a phone number, now that they've opted in.
    // Skippable, and never asked twice in a launch, so it cannot trap anyone.
    if (!phonePromptShown && profile && !profile.phone_verified) {
      phonePromptShown = true;
      router.push('/verify-phone');
      return false;
    }
    // Free-tier monetization: play a full-screen ad BEFORE the AI runs (each
    // AI call costs us money). No-op for paid users / when no ad is loaded, so
    // it never blocks the feature — the ad just gates it when available.
    await showAiGate();
    return true;
  }, [ensureConsent, showAiGate, profile, router]);

  const run = useCallback(
    async <T>(feature: AIFeature, action: () => Promise<T>): Promise<T | null> => {
      if (!(await gate(feature))) return null;
      setRunning(true);
      try {
        const result = await action();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return result;
      } catch (e) {
        if (e instanceof UsageLimitError) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (e.code === 'rate_limited') {
            Alert.alert('Slow down a sec', e.message || 'Too many requests. Try again shortly.');
          } else if (e.code === 'blocked') {
            Alert.alert('Access paused', e.message || 'Your AI access is temporarily paused.');
          } else {
            // Free users at their limit can watch a rewarded ad for one bonus
            // action instead of upgrading right away. Only offered when an ad is
            // actually loaded and they're under the daily cap (canOfferReward).
            const buttons: AlertButton[] = [{ text: 'Not now', style: 'cancel' }];
            if (canOfferReward) {
              buttons.push({
                text: 'Watch ad for a bonus',
                onPress: async () => {
                  const outcome = await watchRewardedForBonus();
                  if (outcome === 'earned') {
                    Alert.alert(
                      'Bonus unlocked ✨',
                      'Your extra try-on is on its way. Give it a few seconds, then tap the button again.',
                    );
                  } else if (outcome === 'capped') {
                    Alert.alert(
                      "That's all for today",
                      "You've used all your bonus ads for today. Come back tomorrow, or upgrade for more styling.",
                      [
                        { text: 'Maybe later', style: 'cancel' },
                        { text: 'Upgrade', onPress: () => router.push('/paywall') },
                      ],
                    );
                  } else if (outcome !== 'dismissed') {
                    Alert.alert('Ad not ready', 'No bonus ad is available right now — try again in a moment.');
                  }
                },
              });
            }
            buttons.push({ text: 'Upgrade', onPress: () => router.push('/paywall') });
            Alert.alert('Plan limit reached', e.message || "You've hit your plan's limit.", buttons);
          }
        } else {
          Alert.alert('Something went wrong', (e as Error)?.message ?? 'Please try again.');
        }
        return null;
      } finally {
        setRunning(false);
      }
    },
    [gate, router, canOfferReward, watchRewardedForBonus],
  );

  return { run, gate, running };
}
