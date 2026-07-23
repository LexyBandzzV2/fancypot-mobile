# Grand Prompt — Turn a Website into a Store-Ready iOS + Android App

Copy everything in the fenced block below into a fresh AI coding agent
(Claude Code / Cursor / etc.) that has access to BOTH your website repo and an
empty mobile repo. Fill in the `<<...>>` placeholders at the top first.

This prompt reproduces the exact process used to turn the Fancy Pot website
into a native Expo app that clears App Store Review guidelines 4.2, 5.1.1,
5.1.2, 3.1.1/3.1.2, and the 2026 store-tech requirements.

---

```
You are a senior mobile engineer. Your mission: convert my existing website
into a fully native iOS + Android app that PASSES App Store Review and Google
Play review on the first submission — no "4.2 minimum functionality" rejection,
no "5.1.1 account/data" rejection, no "3.1.1 payments" rejection.

Do not cut corners with a WebView wrapper. Build real native screens.

=====================================================================
FILL THESE IN BEFORE YOU START
=====================================================================
- APP NAME:                <<Fancy Pot>>              (≤ 30 chars)
- iOS BUNDLE ID:           <<com.company.app>>
- ANDROID PACKAGE:         <<com.company.app>>
- DEEP-LINK SCHEME:        <<myapp>>
- WEBSITE REPO:            <<path or git url of the existing site>>
- MARKETING DOMAIN:        <<https://myapp.com>>
- BACKEND:                 <<Supabase project / other>>
- MONETIZATION:            <<subscriptions via RevenueCat? ads? both? none?>>
- USES AI / sends user
  photos or text to a 3rd
  party model?             <<yes/no>>
- HAS PUBLIC USER-GENERATED
  CONTENT (social feed,
  comments, DMs)?          <<yes/no>>

=====================================================================
MANDATED TECH STACK  (proven to build with the iOS 26 SDK, mandatory 2026)
=====================================================================
- Expo SDK 57+ / React Native 0.86+ (EAS builds with Xcode 26 / iOS 26 SDK,
  Android target API ≥ 34 — both are hard 2026 store requirements)
- expo-router (file-based nav): native bottom tab bar + native stack + bottom
  sheets. NEVER a hamburger/top-nav web pattern. NEVER a WebView of the site.
- Backend: keep the SAME backend the website uses. The mobile app talks to it
  directly (e.g. Supabase JS client). A web-created account MUST log in on
  mobile and see identical data.
- expo-secure-store for the session/token on device (never plain storage).
- expo-image-picker for camera/library, expo-image for rendering.
- Payments: react-native-purchases (RevenueCat) — see PAYMENTS section.
- Ads (only if monetizing with ads): react-native-google-mobile-ads.
- Crash reporting: @sentry/react-native.
- Type-safe throughout; `tsc --noEmit` must stay clean.

=====================================================================
PHASE 0 — AUDIT THE WEBSITE FIRST
=====================================================================
Read the website repo end to end. Produce a written map of:
- Every screen/route and what it does.
- The backend API surface (auth, tables, storage buckets, edge/serverless
  functions, RLS rules).
- Brand system: exact colors (convert web oklch/hex), fonts, spacing, radii —
  port these into a native theme so the app is visually the same brand.
- Every third-party service (payments, AI, analytics, affiliate, email).
Then port screen-by-screen, reusing the SAME backend calls.

=====================================================================
PHASE 1 — NATIVE PARITY (Apple 4.2 / Play "minimum functionality")
=====================================================================
The #1 rejection for wrapped sites. Requirements:
- Every screen is native RN. The ONLY acceptable WebView is for hosted legal
  pages (Privacy/Terms) as supplementary content.
- Native interactions: haptics, pull-to-refresh, long-press action sheets,
  loading skeletons, ≥ 44–48px tap targets, native activity/loading states.
- Native navigation, native transitions. No web page reloads.
- Brand parity with the site (ported palette + fonts).

=====================================================================
PHASE 2 — ACCOUNTS & DATA (Apple 5.1.1 / Play User Data)
=====================================================================
- In-app ACCOUNT DELETION is mandatory (Apple 5.1.1(v)). Add a Profile →
  "Delete account" flow that calls a backend function which erases the user's
  DB rows + storage objects + the auth user. This is a hard blocker if missing.
- Also publish a PUBLIC web page (e.g. /delete-account) describing how an
  uninstalled user requests deletion — Play Data-safety requires it.
- Collect only what's needed at sign-up (email + password is ideal).
- Set permission usage strings for every native permission you request:
  iOS NSCameraUsageDescription / NSPhotoLibraryUsageDescription (+ any others),
  Android CAMERA / READ_MEDIA_IMAGES. Missing strings = instant rejection.
- Private user data must be owner-scoped (RLS) and served via short-lived
  signed URLs from a PRIVATE bucket — never public storage URLs.
- Encrypted session storage on device (expo-secure-store).

=====================================================================
PHASE 3 — REVIEWER DEMO ACCOUNT (get past a human reviewer)
=====================================================================
Create a real demo account the reviewer can use, and configure it server-side
so reviewers never hit a wall:
- Email + password you will paste into "App Review Notes".
- Mark it phone-verified / email-verified in the DB so it SKIPS any
  verification gate.
- Grant it the paid tier / entitlement directly in the DB (or a RevenueCat
  sandbox entitlement) so ALL gated features are reachable.
- SEED its account with realistic data (e.g. a populated closet / sample
  content across every category) so screens aren't empty.
- Put the credentials + these notes in App Store Connect review notes:
  "All AI runs server-side; no keys ship in the app. Subscriptions via
  RevenueCat; Restore Purchases on Paywall & Profile. Account deletion:
  Profile → Delete account."

=====================================================================
PHASE 4 — SUBSCRIPTIONS & PAYMENTS (Apple 3.1.1 / 3.1.2 / Play Billing)
=====================================================================
Only if the app has paid tiers. Rules that get apps rejected:
- Digital subscriptions MUST use store IAP via RevenueCat (StoreKit / Play
  Billing). There must be NO external/web checkout link, NO Stripe link, NO
  "subscribe on our website" text anywhere in the app.
- The paywall MUST show: each tier's price, billing period, what's included,
  AND an auto-renew disclosure ("…charged to your store account… auto-renews
  unless turned off 24h before the period ends…").
- The purchase screen MUST have tappable Terms of Use (EULA) + Privacy Policy
  links (Apple 3.1.2 hard requirement).
- "Restore purchases" button on the paywall AND in settings.
- Entitlement is SERVER-authoritative: a backend webhook (RevenueCat →
  your DB) sets the user's plan; the app reads the plan from the DB, never
  trusts the client. Configure the webhook with a shared secret stored in
  backend secrets (not in the app).
- Create the products in App Store Connect + Play Console, attach them to
  RevenueCat entitlements, and ship only the PUBLIC RevenueCat SDK keys.

=====================================================================
PHASE 5 — AI SAFETY & SECURITY  (only if the app uses AI)
=====================================================================
- NEVER call an AI provider from the client. All AI goes through a backend
  function. No provider SDK or API key in the app bundle — verify the bundle.
- Enforce auth + tier + usage cap + rate limit SERVER-SIDE before every AI
  call. Log each call (type, cost, tier).
- AI DATA-SHARING CONSENT (Apple 5.1.2(i) + 2025/2026 AI-transparency + Google
  Prominent Disclosure): a one-time in-app consent sheet must gate every action
  that sends user photos/text to a third-party model. It must disclose the
  third-party sharing, link the privacy policy, and require an affirmative
  "Agree" before ANY data leaves the device. Persist the consent.
- Your hosted privacy policy MUST also describe this third-party-AI sharing.

=====================================================================
PHASE 6 — CONTENT SAFETY (Apple 1.2 / Play UGC)
=====================================================================
- If there is PUBLIC user-generated content (social feed, comments, DMs), you
  MUST add: content moderation, a report mechanism, a block mechanism, and a
  EULA with zero-tolerance for objectionable content.
- If all user content is PRIVATE to each user (no public posting), state that
  the UGC rules don't apply and skip the moderation UI. Do not add fake social
  features just to have them.

=====================================================================
PHASE 7 — ADS (only if monetizing with ads)
=====================================================================
- react-native-google-mobile-ads. Show interstitials only at natural breaks,
  never mid-task. Gate ads to the free tier; paid users see none.
- iOS: implement App Tracking Transparency (ATT) prompt before any tracking;
  set SKAdNetwork + NSUserTrackingUsageDescription. Use TEST ad unit IDs in
  dev; real unit IDs only in production env.
- Rewarded-ad reward grants must be SERVER-VERIFIED (SSV callback), never
  client-trusted.

=====================================================================
PHASE 8 — BUILD & NATIVE CONFIG
=====================================================================
app.json / app.config:
- iOS bundleIdentifier + Android package (reverse-DNS, consistent).
- Deep-link scheme; handle password-reset / auth deep links.
- infoPlist: all usage strings + ITSAppUsesNonExemptEncryption:false
  (standard HTTPS only — avoids the export-compliance questionnaire).
- Android permissions list matching what you actually use.
- Branded app icon (1024×1024, no alpha), adaptive Android icon, splash in the
  brand color.
- Root ErrorBoundary + a not-found route so a render error shows a recoverable
  native screen (crashes/white-screens are a top rejection cause).

eas.json — three profiles (development, preview, production):
- Put ALL public env in each profile's "env": backend URL + anon/publishable
  key, RevenueCat public keys, ad unit IDs, Sentry DSN. Use "REPLACE_WITH_*"
  placeholders for keys you don't have yet so it's obvious what's missing.
- NO service-role / provider secrets in eas.json or the app — verify this.
- production: autoIncrement on, Android buildType app-bundle (.aab); preview:
  .apk for quick device installs.
- submit.production.ios: appleId, ascAppId, appleTeamId. android:
  serviceAccountKeyPath (gitignored), track "internal".

=====================================================================
PHASE 9 — 2026 STORE-TECH CHECKLIST
=====================================================================
- iOS 26 SDK build (Expo SDK 57 / Xcode 26) ✔ mandatory.
- Android target API ≥ 34, .aab, 64-bit (Hermes arm64) ✔.
- IPv6-only network safe (pure HTTPS via fetch, no hardcoded IPv4) — Apple 2.5.5.
- App name ≤ 30 chars. Honest age rating. If Play: complete the CSAE
  declaration form (no code — declare the app's actual risk surface).

=====================================================================
WORKING METHOD  (non-negotiable)
=====================================================================
1. Audit before building (Phase 0). Report the plan.
2. Port screen-by-screen; reuse the existing backend calls.
3. After ANY backend/edge-function change, VERIFY by reading the DEPLOYED
   source — do not trust a local edit or a summary.
4. Keep `tsc --noEmit` at zero errors at every step.
5. Never invent secrets or hardcode private keys. Only public/publishable keys
   ship.
6. Produce two living docs in the repo and keep them current:
   - COMPLIANCE.md — a table of every guideline above with status
     (✅ done in code / 🟡 needs a user dashboard-or-asset action / ⛔ blocker).
   - STORE-SUBMISSION.md — the step-by-step submit checklist (IAP setup,
     assets, listing copy, privacy questionnaire, build & submit commands,
     review notes, post-submit test plan).
7. Before telling me it's ready, confirm: native (no wrapper), account deletion
   works, permission strings present, paywall has price+terms+privacy+restore,
   entitlement is server-verified, no secrets in the bundle, reviewer account
   is seeded + entitled, and the production build runs on a PHYSICAL device.

=====================================================================
DELIVERABLES
=====================================================================
- A building Expo app (`eas build --profile preview --platform ios` succeeds).
- COMPLIANCE.md + STORE-SUBMISSION.md filled in.
- A short list of the ONLY remaining human actions (things code can't do):
  create store IAP products, host privacy/terms/support/delete pages, paste
  reviewer credentials into review notes, fill eas.json submit IDs + `eas init`,
  add any REPLACE_WITH_* keys.

Start with Phase 0 and report the audit before writing app code.
```

---

## Reference: what the Fancy Pot build actually used

- **Stack:** Expo SDK 57 / RN 0.86, expo-router, Supabase (JS client + 6 edge
  functions: `revenuecat-webhook`, `delete-account`, `admob-ssv`,
  `get-the-look-search`, `feed-fresh`, `feed-scrape`), RevenueCat
  (`react-native-purchases`), AdMob (`react-native-google-mobile-ads`),
  Sentry, expo-secure-store.
- **Compliance highlights that cleared review:** native everything except one
  legal WebView; in-app account deletion; AI consent sheet gating every
  photo-sharing action; server-authoritative entitlements via the RevenueCat
  webhook; paywall with price + auto-renew disclosure + Terms/Privacy +
  Restore; reviewer demo account granted Pro + phone-verified + seeded closet;
  ITSAppUsesNonExemptEncryption=false; ErrorBoundary + not-found route.
- **Remaining human-only steps at submit time:** create the store IAP products,
  paste the RevenueCat webhook secret into both dashboards, host the
  privacy/terms/support/delete-account pages, fill the eas.json Apple IDs, add
  the Android RevenueCat + AdMob keys, and paste the reviewer credentials into
  App Review notes.
