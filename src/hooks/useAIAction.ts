import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { UsageLimitError } from '@/lib/api';
import { useAIConsent } from '@/providers/AIConsentProvider';

/**
 * Wraps an AI edge-function call with consistent loading state + error handling.
 * When the server reports the user is over their plan limit or rate-limited, we
 * surface a friendly alert and offer to open the paywall — the SERVER is the one
 * enforcing the limit, this is only UX on top of that decision.
 */
export function useAIAction() {
  const router = useRouter();
  const { ensureConsent } = useAIConsent();
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | null> => {
      // Apple 5.1.2(i) / Google Prominent Disclosure: get consent before sending
      // the user's photos to third-party AI. No-op after the first grant.
      const consented = await ensureConsent();
      if (!consented) return null;
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
            Alert.alert('Plan limit reached', e.message || "You've hit your plan's limit.", [
              { text: 'Not now', style: 'cancel' },
              { text: 'Upgrade', onPress: () => router.push('/paywall') },
            ]);
          }
        } else {
          Alert.alert('Something went wrong', (e as Error)?.message ?? 'Please try again.');
        }
        return null;
      } finally {
        setRunning(false);
      }
    },
    [router, ensureConsent],
  );

  return { run, running };
}
