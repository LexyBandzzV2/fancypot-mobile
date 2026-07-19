import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus,
} from 'expo-tracking-transparency';
import mobileAds, {
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
  MaxAdContentRating,
} from '@/lib/ads/admob';
import { config } from '@/lib/config';
import { useAuth } from './AuthProvider';
import { useSubscription } from './SubscriptionProvider';
import { rewardsRemainingToday, recordRewardWatched, REWARD_DAILY_CAP } from '@/lib/ads/rewardCap';

// Ads only run on the native iOS/Android builds. On web (the in-browser preview)
// the SDK is stubbed and this whole provider stays inert.
const adsSupported = Platform.OS === 'ios' || Platform.OS === 'android';
// Don't show interstitials back-to-back — feels janky and risks Apple rejection.
const MIN_INTERSTITIAL_GAP_MS = 90 * 1000;
// Back off before retrying a failed ad load so a persistent error can't spin.
const AD_RETRY_MS = 30 * 1000;
const AD_KEYWORDS = ['fashion', 'clothing', 'style', 'shopping', 'beauty'];

/** Outcome of offering a rewarded ad. */
export type RewardOutcome =
  | 'earned' // user watched to completion; SSV will grant the bonus server-side
  | 'dismissed' // user closed the ad early, no reward
  | 'capped' // hit the daily cap — come back tomorrow
  | 'not-ready' // no ad loaded yet / already showing one
  | 'unavailable'; // ads not supported here, or user is not on the free tier

interface AdsContextValue {
  /** Show an interstitial if the user is free-tier, one is loaded, and the gap has elapsed. No-op otherwise. */
  maybeShowInterstitial: () => Promise<void>;
  /** Show a rewarded ad to earn one bonus AI action. Resolves with the outcome. */
  watchRewardedForBonus: () => Promise<RewardOutcome>;
  /** True when a rewarded ad can be offered right now (free tier, loaded, under the daily cap). */
  canOfferReward: boolean;
  /** Rewarded ads the user may still watch today (0..REWARD_DAILY_CAP). */
  rewardsRemaining: number;
}

const AdsContext = createContext<AdsContextValue | undefined>(undefined);

// In dev we ALWAYS use Google's test units (AdMob bans real ads in debug
// builds). In production we use the real unit from config, falling back to the
// test unit if the env placeholder wasn't replaced — so a build never crashes.
function interstitialUnitId(): string {
  if (__DEV__ || !adsSupported) return TestIds.INTERSTITIAL;
  const real = Platform.OS === 'ios' ? config.admob.iosInterstitial : config.admob.androidInterstitial;
  return real || TestIds.INTERSTITIAL;
}
function rewardedUnitId(): string {
  if (__DEV__ || !adsSupported) return TestIds.REWARDED;
  const real = Platform.OS === 'ios' ? config.admob.iosRewarded : config.admob.androidRewarded;
  return real || TestIds.REWARDED;
}

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { tier } = useSubscription();
  // Ads + the rewarded offer are for FREE users only. Both paid tiers advertise
  // "No ads" as a perk, so gating on the authoritative backend tier is correct.
  const isFree = tier.entitlement === 'free';

  // Default to non-personalized until ATT resolves (privacy-safe default).
  const [npaOnly, setNpaOnly] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [rewardedReady, setRewardedReady] = useState(false);
  const [rewardsRemaining, setRewardsRemaining] = useState(REWARD_DAILY_CAP);

  const interstitialRef = useRef<InterstitialAd | null>(null);
  const rewardedRef = useRef<RewardedAd | null>(null);
  const interstitialReadyRef = useRef(false);
  const rewardedReadyRef = useRef(false);
  const lastInterstitialAtRef = useRef(0);
  const userIdRef = useRef<string | undefined>(undefined);
  // Bridges the imperative watchRewardedForBonus() promise to the ad's events.
  const rewardFlowRef = useRef<{ earned: boolean; resolve: (o: RewardOutcome) => void } | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  // Resolve + clear any in-flight watchRewardedForBonus() promise exactly once.
  // EVERY teardown path (CLOSED, ERROR, effect cleanup, show() rejection) routes
  // through here, so the promise can never leak and permanently jam the
  // one-at-a-time guard (which would otherwise brick the feature for the session).
  const settleReward = useCallback((outcome: RewardOutcome) => {
    const flow = rewardFlowRef.current;
    if (flow) {
      rewardFlowRef.current = null;
      flow.resolve(outcome);
    }
  }, []);

  // One-time SDK init: request ATT (personalized vs not), configure, initialize.
  // Consent/config MUST happen before initialize() per the SDK docs.
  useEffect(() => {
    if (!adsSupported) return;
    let cancelled = false;
    (async () => {
      try {
        let status = (await getTrackingPermissionsAsync()).status;
        if (status === PermissionStatus.UNDETERMINED) {
          status = (await requestTrackingPermissionsAsync()).status;
        }
        if (cancelled) return;
        setNpaOnly(status !== PermissionStatus.GRANTED);
        await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG });
        await mobileAds().initialize();
        if (!cancelled) setInitialized(true);
      } catch {
        // ATT/init failure is non-fatal — ads simply stay off; app is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build + preload the interstitial. Rebuilt if the personalization choice
  // changes or the user leaves/returns to the free tier.
  useEffect(() => {
    if (!adsSupported || !initialized || !isFree) {
      interstitialRef.current = null;
      interstitialReadyRef.current = false;
      return;
    }
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const ad = InterstitialAd.createForAdRequest(interstitialUnitId(), {
      requestNonPersonalizedAdsOnly: npaOnly,
      keywords: AD_KEYWORDS,
    });
    interstitialRef.current = ad;
    interstitialReadyRef.current = false;

    const unsubs = [
      ad.addAdEventListener(AdEventType.LOADED, () => {
        interstitialReadyRef.current = true;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        interstitialReadyRef.current = false;
        ad.load(); // preload the next one
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => {
        interstitialReadyRef.current = false;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => ad.load(), AD_RETRY_MS);
      }),
    ];
    ad.load();

    return () => {
      unsubs.forEach((u) => u());
      if (retryTimer) clearTimeout(retryTimer);
      interstitialRef.current = null;
      interstitialReadyRef.current = false;
    };
  }, [initialized, isFree, npaOnly]);

  // Build + preload the rewarded ad. Recreated when the user changes so the SSV
  // callback carries the right Supabase user id (SSV options are baked at
  // create time and can't be changed after load).
  useEffect(() => {
    if (!adsSupported || !initialized || !isFree || !user?.id) {
      rewardedRef.current = null;
      rewardedReadyRef.current = false;
      setRewardedReady(false);
      return;
    }
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const ad = RewardedAd.createForAdRequest(rewardedUnitId(), {
      requestNonPersonalizedAdsOnly: npaOnly,
      keywords: AD_KEYWORDS,
      // Both are echoed back on the SSV callback; we send the user id in each so
      // the server can credit the reward even if AdMob drops one of them.
      serverSideVerificationOptions: { userId: user.id, customData: user.id },
    });
    rewardedRef.current = ad;
    rewardedReadyRef.current = false;
    setRewardedReady(false);

    const setReady = (v: boolean) => {
      rewardedReadyRef.current = v;
      setRewardedReady(v);
    };

    const unsubs = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => setReady(true)),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        if (rewardFlowRef.current) rewardFlowRef.current.earned = true;
        const uid = userIdRef.current;
        // Record the local daily count; the server grants the real bonus via SSV.
        if (uid) recordRewardWatched(uid).then(setRewardsRemaining).catch(() => {});
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        const earned = rewardFlowRef.current?.earned ?? false;
        settleReward(earned ? 'earned' : 'dismissed');
        setReady(false);
        ad.load(); // preload the next one
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => {
        setReady(false);
        // ERROR is a generic channel and can fire after show() with a flow
        // pending — unblock the caller so its promise never hangs.
        settleReward('not-ready');
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => ad.load(), AD_RETRY_MS);
      }),
    ];
    ad.load();

    return () => {
      unsubs.forEach((u) => u());
      if (retryTimer) clearTimeout(retryTimer);
      // Teardown mid-watch (upgrade/logout/user change): resolve the pending
      // promise so it can't leak and jam the one-at-a-time guard.
      settleReward('not-ready');
      rewardedRef.current = null;
      rewardedReadyRef.current = false;
    };
  }, [initialized, isFree, npaOnly, user?.id, settleReward]);

  // Keep today's remaining count fresh when the user changes.
  useEffect(() => {
    if (!user?.id) {
      setRewardsRemaining(REWARD_DAILY_CAP);
      return;
    }
    rewardsRemainingToday(user.id).then(setRewardsRemaining).catch(() => {});
  }, [user?.id]);

  // Recompute when the app returns to the foreground, so the offer reappears
  // after the local day rolls over while the session was backgrounded (the
  // per-user effect above never re-runs across a midnight boundary on its own).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const uid = userIdRef.current;
      if (state === 'active' && uid) {
        rewardsRemainingToday(uid).then(setRewardsRemaining).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const maybeShowInterstitial = useCallback(async () => {
    if (!adsSupported || !isFree) return;
    const ad = interstitialRef.current;
    if (!ad || !interstitialReadyRef.current) return;
    const now = Date.now();
    if (now - lastInterstitialAtRef.current < MIN_INTERSTITIAL_GAP_MS) return;
    lastInterstitialAtRef.current = now;
    interstitialReadyRef.current = false;
    try {
      await ad.show();
    } catch {
      // Native show() rejected without a CLOSED/ERROR event — best-effort reload
      // so interstitials don't silently stop for the rest of the session.
      ad.load();
    }
  }, [isFree]);

  const watchRewardedForBonus = useCallback(async (): Promise<RewardOutcome> => {
    if (!adsSupported || !isFree) return 'unavailable';
    const uid = userIdRef.current;
    if (!uid) return 'unavailable';
    const remaining = await rewardsRemainingToday(uid);
    if (remaining <= 0) return 'capped';
    const ad = rewardedRef.current;
    if (!ad || !rewardedReadyRef.current) return 'not-ready';
    if (rewardFlowRef.current) return 'not-ready'; // one at a time
    return new Promise<RewardOutcome>((resolve) => {
      rewardFlowRef.current = { earned: false, resolve };
      Promise.resolve(ad.show()).catch(() => {
        // Native show() rejected without a CLOSED/ERROR event — reset readiness,
        // preload a fresh ad, and unblock the caller.
        rewardedReadyRef.current = false;
        setRewardedReady(false);
        ad.load();
        settleReward('not-ready');
      });
    });
  }, [isFree, settleReward]);

  const canOfferReward = adsSupported && isFree && rewardedReady && rewardsRemaining > 0;

  const value = useMemo<AdsContextValue>(
    () => ({
      maybeShowInterstitial,
      watchRewardedForBonus,
      canOfferReward,
      rewardsRemaining,
    }),
    [maybeShowInterstitial, watchRewardedForBonus, canOfferReward, rewardsRemaining],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  const ctx = useContext(AdsContext);
  if (!ctx) throw new Error('useAds must be used within an AdsProvider');
  return ctx;
}
