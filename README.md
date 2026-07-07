# Fancy Pot — Mobile (iOS & Android)

A **fully native** Expo / React Native rebuild of the [Fancy Pot](https://fancypot.org)
web app (`closet-conjurer-app`). This is **not** a WebView wrapper — every screen is
built from scratch with native navigation, bottom sheets, haptics and gestures. It shares
the **same Supabase backend** as the website, so a user's account, closet, saved outfits,
usage history and subscription tier are identical across web, iOS and Android.

---

## Table of contents

1. [Stack](#stack)
2. [Project structure](#project-structure)
3. [Run locally](#run-locally)
4. [Environment variables](#environment-variables)
5. [Backend (Supabase) setup](#backend-supabase-setup)
6. [Subscriptions (RevenueCat)](#subscriptions-revenuecat)
7. [Security model](#security-model)
8. [EAS builds & store submission](#eas-builds--store-submission)
9. [App Store / Play Store checklist](./STORE-SUBMISSION.md)

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Expo SDK 57, React Native 0.86, React 19 |
| Navigation | `expo-router` (file-based) — bottom tabs + native stack + modal sheets |
| Backend | **Existing** Supabase project `gizqpfbmqgwhbalywkqv` (auth, Postgres, storage, edge functions) |
| Auth session | `expo-secure-store` (encrypted keychain / keystore) |
| Subscriptions | RevenueCat (`react-native-purchases`) → mirrored to `profiles.plan` |
| AI | **Supabase Edge Functions only** — never called from the client |
| Fonts | Pinyon Script · Cormorant Garamond · Inter (via `@expo-google-fonts`) |

## Project structure

```
app/                         # expo-router routes
  _layout.tsx                # providers + font loading + auth-gated navigation
  index.tsx                  # entry redirect
  (auth)/                    # welcome, sign-in, sign-up, forgot-password
  (tabs)/                    # bottom tab bar
    index.tsx                #   Closet (wardrobe grid, add via bottom sheet)
    feed.tsx                 #   Style Feed (pull-to-refresh, react/save)
    create.tsx               #   Style hub → stylist / get-the-look / try-on
    saved.tsx                #   Saved outfits library
    profile.tsx              #   Account, plan, settings, legal, delete
  style/                     # pushed AI screens (stylist, get-the-look, try-on)
  settings/                  # manage-subscription, preferences, delete-account
  legal/[doc].tsx            # privacy / terms / support (hosted pages)
  paywall.tsx                # native 3-tier paywall (modal)
  verify-phone.tsx           # OTP phone verification (modal)
src/
  components/                # Button, Screen, Card, BottomSheet, TextField, …
  hooks/                     # useWardrobe, useOutfits, useImagePicker, useAIAction
  lib/                       # supabase client, api wrappers, storage, plans, config
  providers/                 # AuthProvider, SubscriptionProvider
  theme/                     # colors (from web oklch), typography, spacing
supabase/
  functions/revenuecat-webhook/   # RC → profiles.plan sync (deploy to shared project)
  functions/delete-account/       # in-app account deletion (App Store requirement)
  migrations/                      # additive ai_usage columns (optional)
  PATCH-wardrobe-process.md        # backend patch closing the one rate-limit gap
```

## Run locally

```bash
npm install --legacy-peer-deps      # legacy flag: Expo pins react vs react-dom peer
cp .env.example .env                 # then fill in values (see below)

npx expo start                       # dev server; press i / a, or scan in Expo Go*
```

> \* **Expo Go caveat:** `react-native-purchases` (RevenueCat) requires a **development
> build**, not Expo Go. Everything else runs in Expo Go. To exercise IAP:
> `npx expo run:ios` / `npx expo run:android`, or `eas build --profile development`.

Type-check anytime with `npm run typecheck`.

## Environment variables

All values are **publishable** (safe to ship). No secret keys live in the app.

| Var | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Existing project URL (`https://gizqpfbmqgwhbalywkqv.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Existing anon key (RLS-protected) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat public iOS SDK key |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat public Android SDK key |

Local dev reads `.env`. **EAS cloud builds** read the `env` block in `eas.json`
(Supabase values are already there; add the RC keys as EAS secrets — see below).

## Backend (Supabase) setup

The app points at your **existing** project — no new backend. Two small, non-breaking
additions make mobile subscriptions + store compliance work. Deploy from a machine with
the Supabase CLI linked to `gizqpfbmqgwhbalywkqv`:

```bash
# 1. RevenueCat → profiles.plan webhook (unifies mobile IAP with web Stripe)
supabase secrets set REVENUECAT_WEBHOOK_SECRET=<long-random-string>
supabase functions deploy revenuecat-webhook --no-verify-jwt

# 2. In-app account deletion (App Store 5.1.1(v) / Play requirement)
supabase functions deploy delete-account

# 3. (optional) additive ai_usage columns for the mobile analytics shape
supabase db push
```

Then apply [`supabase/PATCH-wardrobe-process.md`](./supabase/PATCH-wardrobe-process.md)
in the web/backend repo — it closes the **only** AI function that wasn't rate-limited.

Everything else (tables, RLS, auth, storage bucket `wardrobe`, the other 5 AI edge
functions with their per-tier spend caps) already exists and is reused as-is.

## Subscriptions (RevenueCat)

Tiers are defined once in [`src/lib/plans.ts`](./src/lib/plans.ts):

| Mobile tier | RC entitlement | `profiles.plan` | Outfits/mo | Closet items | Try-ons/wk |
| --- | --- | --- | --- | --- | --- |
| Free | `free` | `free` | 3 | 20 | 2 |
| Pro | `pro` | `pro` | 15 | 60 | 6 |
| Business | `business` | `ultimate` | 45 | 180 | 18 |

"Business" is the mobile name for the tier the web/DB call "ultimate" — mapped, not
migrated, so the live Stripe/web flow is untouched.

**RevenueCat dashboard setup:**
1. Create entitlements `pro` and `business`.
2. Create products/packages in App Store Connect + Play Console, attach to the entitlements.
3. Add the webhook: URL `https://gizqpfbmqgwhbalywkqv.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header = your `REVENUECAT_WEBHOOK_SECRET`.
4. Put the public SDK keys in `.env` / EAS secrets.

The client identifies the RC user with the Supabase `user.id`, so webhook events map
straight back to the right account.

## Security model

- **No AI on the client.** All AI goes through `supabase.functions.invoke(...)`
  (`src/lib/api.ts`). No provider SDK or key is bundled.
- **Server-enforced limits.** Each AI edge function runs `chargeAiSpend()` →
  auth check + per-tier monthly cap + rate limits (10/min, 60/hr, 200/day) + logs to
  `ai_usage`. The client's `useAIAction` hook only *reacts* to the server's 402/403/429.
- **Gating tier = server truth.** `SubscriptionProvider.tier` derives from
  `profiles.plan` (kept authoritative by the webhook), not the raw device entitlement.
- **Encrypted sessions** via `expo-secure-store`. **Private storage** — the `wardrobe`
  bucket is owner-scoped; images render through short-lived signed URLs.

## EAS builds & store submission

```bash
npm i -g eas-cli && eas login
eas init                       # writes extra.eas.projectId in app.json

# add RevenueCat keys as build-time secrets (Supabase values already in eas.json)
eas secret:create --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_xxx
eas secret:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_xxx

eas build --profile development --platform ios      # dev client (IAP testing)
eas build --profile preview --platform all          # internal QA (.apk / ad-hoc)
eas build --profile production --platform all       # store binaries

eas submit --profile production --platform ios       # → App Store Connect
eas submit --profile production --platform android   # → Play Console
```

Fill the `REPLACE_WITH_*` placeholders in [`eas.json`](./eas.json) (Apple ID, ASC app id,
team id) before submitting. Full step-by-step in
[**STORE-SUBMISSION.md**](./STORE-SUBMISSION.md).
