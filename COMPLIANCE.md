# App Store & Google Play Compliance Audit

Status of the Fancy Pot mobile app against the guidelines reviewers actually
enforce. Legend: ✅ done in code · 🟡 needs a user action (asset, account, or
dashboard/hosting step — code side is ready) · ⛔ blocker if skipped.

---

## A. Genuinely native (not a website wrapper) — Apple 4.2 / Play "minimum functionality"

| Requirement | Status | Notes |
| --- | --- | --- |
| Native UI, not a WebView of the site | ✅ | Every screen is React Native. The **only** WebView is `app/legal/[doc].tsx`, used solely for the hosted Privacy/Terms pages — allowed as supplementary content. |
| Native navigation patterns | ✅ | expo-router bottom tab bar + native stack + animated bottom sheets. No hamburger/top-nav web patterns. |
| Native interactions | ✅ | Haptics, pull-to-refresh, long-press action sheets, native activity indicators, loading skeletons, 48px tap targets. |
| Brand parity with web | ✅ | Web `oklch` palette ported to RN theme; Pinyon Script / Cormorant / Inter fonts; cream `#FAF3E7` surfaces. |

## B. Accounts & data — Apple 5.1.1 / Play "User Data"

| Requirement | Status | Notes |
| --- | --- | --- |
| In-app **account deletion** | ✅ | Profile → Delete account → `delete-account` edge function erases rows + storage + auth user. **Deploy that function** (README). |
| Web-accessible deletion (Play requirement for uninstalled users) | 🟡 | Add a public page e.g. `https://fancypot.org/delete-account` describing how to request deletion, and enter that URL in the Play Data safety form. |
| Only collect necessary data at sign-up | ✅ | Email + password only. |
| Permission usage strings | ✅ | Camera + Photos strings set in `app.json` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, Android `CAMERA` / `READ_MEDIA_IMAGES`). |
| Encrypted session storage | ✅ | `expo-secure-store` on device (localStorage only in the browser-preview build). |
| Private user data (RLS) | ✅ | Closet/outfits owner-scoped; images served via short-lived signed URLs from a private bucket. |
| Reviewer **demo account** | 🟡 ⛔ | Account already created and verified working: `fancypot.testreview@gmail.com` / `FancyPotReview2026!`. Still to do: seed its closet with a few pieces and grant it Pro in RevenueCat **sandbox**, then paste the credentials into App Review notes. Without this, gated AI features can't be reviewed → rejection. |

## C. Subscriptions & payments — Apple 3.1.1 / 3.1.2 / Play Billing

| Requirement | Status | Notes |
| --- | --- | --- |
| Digital subscriptions use store IAP (not external pay) | ✅ | RevenueCat → StoreKit / Play Billing. **No** external/web checkout link anywhere in the app. |
| No links to the web pricing/Stripe inside the app | ✅ | Verified — paywall + manage screen only use RevenueCat and the store's own subscription-management URL. |
| Paywall shows price, duration, what's included | ✅ | `app/paywall.tsx` lists each tier's price, perks, and renewal terms. |
| Auto-renew disclosure text | ✅ | Added: "charged to your store account… auto-renews unless turned off 24h before…". |
| **Terms of Use + Privacy links on the purchase screen** | ✅ | Tappable Terms/Privacy links added to the paywall (Apple 3.1.2 hard requirement). |
| Restore purchases | ✅ | On the paywall and in Profile → Manage subscription. |
| Server-verified entitlement (not client-trusted) | ✅ | Gating reads `profiles.plan`, kept authoritative by `revenuecat-webhook`. |
| Products configured in stores + RevenueCat | 🟡 ⛔ | Create the Pro/Business products in App Store Connect + Play Console and attach to RevenueCat entitlements `pro`/`business`. Add the two public SDK keys to env/EAS. |

## D. AI safety & security (your stated priority)

| Requirement | Status | Notes |
| --- | --- | --- |
| No AI provider called from the client | ✅ | All AI via `supabase.functions.invoke`. No provider SDK/key in the bundle. |
| Auth + tier + monthly cap + rate limit before each AI call | ✅ | Enforced server-side by `chargeAiSpend()` in every AI edge function. |
| `wardrobe-process` gap closed | 🟡 | Apply `supabase/PATCH-wardrobe-process.md` (the one function that lacked the guard) and redeploy. |
| `ai_usage` logging (type, cost, tier) | ✅ | Existing `ai_usage` table + optional additive migration for the exact spec columns. |
| No secrets in the app | ✅ | Only publishable Supabase + RevenueCat keys ship; verified `.env`/`eas.json` contain no service-role/provider secrets. |
| **AI data-sharing disclosure + consent** (Apple 5.1.2(i) / 2025 AI-transparency / Google Prominent Disclosure) | ✅ | A one-time in-app consent sheet (`AIConsentProvider`) gates every AI action — analyze, generate, try-on, recommend, and closet uploads. Discloses that photos are sent to third-party AI, links the privacy policy, requires affirmative "Agree" before any sharing, and persists on `profiles.preferences.ai_consent`. Your hosted **privacy policy must also describe this third-party-AI sharing**. |

## E. Content safety — Apple 1.2 / Play UGC

| Requirement | Status | Notes |
| --- | --- | --- |
| Moderation / report / block for public UGC | ✅ n/a | No public/social UGC. Closet, outfits and try-on images are **private to each user**; the Feed is curated products, not user posts. So the UGC-moderation rules don't apply. |
| AI images of people | ✅ | Try-on uses the user's own photo, kept private. |

## F. Build, assets & stability

| Requirement | Status | Notes |
| --- | --- | --- |
| Bundle identifiers | ✅ | iOS + Android both `org.fancypot.app` in `app.json`. |
| Branded app icon | ✅ | On-brand coat-hanger icon on cream generated into `assets/` (icon, adaptive foreground, monochrome, splash, favicon). Swap for a designer version anytime. |
| Splash screen in brand color | ✅ | Cream `#FAF3E7` splash via `expo-splash-screen`. |
| No crashes / white screens | ✅ | Root `ErrorBoundary` + `+not-found` route added; a render error shows a recoverable native screen. |
| Password-reset deep link handled | ✅ | `fancypot://reset-password` parsed → set-new-password screen (`useAuthDeepLinks`). |
| `ITSAppUsesNonExemptEncryption` | ✅ | Set `false` (standard HTTPS only). |
| Sign in with Apple (4.8) | ✅ n/a | Not required — no third-party/social login, only email/password. |
| EAS build/submit configured | ✅ 🟡 | `eas.json` ready; fill `REPLACE_WITH_*` (Apple ID, ASC app id, team id) and run `eas init` for the project id. |
| Type-check & bundle | ✅ | `tsc --noEmit` clean; `expo export` produces a valid iOS bundle. |

## F2. 2026 store-tech requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| iOS 26 SDK (Apple, mandatory April 2026) | ✅ | Expo SDK 57 / RN 0.86 — EAS builds with Xcode 26 / iOS 26 SDK. |
| Android target API ≥ 34 (Play) | ✅ | Expo SDK 57 targets API 36 (Android 16). |
| Android App Bundle (.aab) | ✅ | `eas.json` production profile defaults to app-bundle; only preview builds .apk. |
| 64-bit support | ✅ | RN/Hermes arm64 builds by default. |
| IPv6-only networks (Apple 2.5.5) | ✅ | Pure HTTPS via fetch to Supabase; no hardcoded IPv4. |
| App name ≤ 30 chars | ✅ | "Fancy Pot" (9). |
| Play CSAE declaration (Jan 2026) | 🟡 | A Play Console *form*, not code. App has no UGC/social/chat, so declare "no child sexual abuse material risk surface"; support contact exists in-app (Profile → Contact support). |
| US age-verification laws (TX/UT, Jan 2026) | ✅ n/a | Enforced at store/OS level via declared age range; no age-gated content in the app. Answer the age-rating questionnaire honestly (likely 4+/Everyone). |
| Crash-free stability (top rejection cause) | ✅ | Root ErrorBoundary + not-found route; typecheck + Metro bundle + live click-through verified. **Still test the real build on a physical device before submitting.** |

## G. Hosted pages you must have live (linked from the app)

| URL | Used by | Status |
| --- | --- | --- |
| `https://fancypot.org/privacy` | Profile + Paywall | 🟡 confirm it's live |
| `https://fancypot.org/terms` | Profile + Paywall | 🟡 confirm it's live |
| `https://fancypot.org/support` | Profile → Contact support | 🟡 confirm it's live (or the app also offers `mailto:support@fancypot.org`) |
| `https://fancypot.org/delete-account` | Play Data safety | 🟡 create |

---

## Remaining actions before submission (the 🟡 items)

1. **Deploy** `revenuecat-webhook`, `delete-account`, and apply the wardrobe-process patch to the shared Supabase project.
2. **Create store products** (Pro, Business) in App Store Connect + Play Console; wire to RevenueCat; add the two public SDK keys.
3. **Host** the privacy / terms / support / delete-account pages (or confirm the existing ones resolve).
4. **Create a reviewer demo account** with a seeded closet + Pro sandbox entitlement; add to review notes.
5. **Fill** `eas.json` submit placeholders + `eas init`, then build & submit.

Everything on the **code side** is complete and verified — items above are external configuration/assets only.
