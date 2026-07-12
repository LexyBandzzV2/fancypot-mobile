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
} as const;
