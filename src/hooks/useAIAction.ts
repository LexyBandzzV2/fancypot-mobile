import { useCallback, useState } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { UsageLimitError } from '@/lib/api';
import { useAIConsent } from '@/providers/AIConsentProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useAds } from '@/providers/AdsProvider';

/**
 * Wraps an AI edge-function call with consistent loading state + error handling.
 * When the server reports the user is over their plan limit or rate-limited, we
 * surface a friendly alert and offer to open the paywall — the SERVER is the one
 * enforcing the limit, this is only UX on top of that decision.
 */
export function useAIAction() {
  const router = useRouter();
  const { ensureConsent } = useAIConsent();
  const { profile } = useAuth();
  const { canOfferReward, watchRewardedForBonus, showAiGate } = useAds();
  const [running, setRunning] = useState(false);

  /**
   * The pre-AI gate WITHOUT running any action: phone verification → data
   * consent → interstitial ad. Resolves true only when every gate is cleared,
   * so a caller can run the AI call itself (e.g. hand it to a background job
   * that outlives this screen). Returns false — silently or after a prompt —
   * when the user must verify / declines consent.
   */
  const gate = useCallback(async (): Promise<boolean> => {
    // One-time phone verification gate: browsing stays open, but AI features
    // require a verified phone so the free tier can't be farmed via fake accounts.
    if (profile && !profile.phone_verified) {
      Alert.alert(
        'Verify your number first',
        'To keep Fancy Pot fair for everyone, verify your phone once before using AI features.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Verify', onPress: () => router.push('/verify-phone') },
        ],
      );
      return false;
    }
    // Apple 5.1.2(i) / Google Prominent Disclosure: get consent before sending
    // the user's photos to third-party AI. No-op after the first grant.
    const consented = await ensureConsent();
    if (!consented) return false;
    // Free-tier monetization: play a full-screen ad BEFORE the AI runs (each
    // AI call costs us money). No-op for paid users / when no ad is loaded, so
    // it never blocks the feature — the ad just gates it when available.
    await showAiGate();
    return true;
  }, [router, ensureConsent, profile, showAiGate]);

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | null> => {
      if (!(await gate())) return null;
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
