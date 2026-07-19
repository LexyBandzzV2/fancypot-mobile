/**
 * Runtime configuration, sourced from EXPO_PUBLIC_* env vars (see .env.example).
 *
 * Only *publishable* values live here:
 *   - Supabase URL + anon key are safe on the client (RLS protects data).
 *   - RevenueCat public SDK keys are designed to ship in the app binary.
 * No secret keys (service role, Stripe secret, AI provider keys) ever touch the
 * mobile bundle — those live only in Supabase Edge Function secrets.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

// Real RevenueCat public keys are prefixed "appl_" (iOS) / "goog_" (Android).
// Anything else (empty, REPLACE_WITH_ placeholders, typos) is treated as unset
// so SubscriptionProvider takes its graceful no-IAP path instead of crashing
// the SDK at configure time.
function revenueCatKey(prefix: string, value: string | undefined): string {
  return value && value.startsWith(prefix) ? value : '';
}

// Real AdMob ad-unit ids look like "ca-app-pub-<16digits>/<10digits>". Anything
// else (empty, REPLACE_WITH_ placeholders) is treated as unset so AdsProvider
// falls back to Google's official test ad units — which is also what we always
// use in __DEV__. Never ship a debug build with real ad units (AdMob bans it).
function admobUnit(value: string | undefined): string {
  return value && value.startsWith('ca-app-pub-') && value.includes('/') ? value : '';
}

export const config = {
  supabaseUrl: required(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  // RevenueCat public SDK keys (platform specific). Optional at dev time so the
  // app still boots without IAP configured; the paywall degrades gracefully.
  revenueCatIosKey: revenueCatKey('appl_', process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
  revenueCatAndroidKey: revenueCatKey('goog_', process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY),
  // AdMob ad-unit ids (platform specific). Empty => AdsProvider uses Google's
  // test units. Real units are injected per-build via eas.json, like the RC keys.
  // Note: the AdMob *app* id (a separate value) lives in app.json, since it is
  // baked into the native binary at build time, not read at runtime.
  admob: {
    iosInterstitial: admobUnit(process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL),
    androidInterstitial: admobUnit(process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL),
    iosRewarded: admobUnit(process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED),
    androidRewarded: admobUnit(process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED),
  },
} as const;
