# Ads setup & deploy checklist (AdMob)

*[← README](./README.md) · See also: [STORE-SUBMISSION.md](./STORE-SUBMISSION.md) § App Store Connect (IDFA questionnaire) · [supabase/web-repo-patches/README.md](./supabase/web-repo-patches/README.md) (backend deploy status for this feature)*

Free-tier monetization: full-screen **interstitials** + opt-in **rewarded ads**
(watch an ad → one bonus AI action, capped 3/day). Paid tiers see **no ads**.

The code ships with Google's **test ad units** as the default, so builds work and
are safe to test immediately. Real revenue needs the steps below. Do them in
order; nothing here is required just to build a TestFlight test build.

---

## 1. Create your AdMob account + ad units

1. Sign up at <https://admob.google.com> (free).
2. **Apps → Add app → iOS →** "not listed yet" → name it **Fancy Pot**. Save the
   **App ID** (`ca-app-pub-XXXXXXXX~YYYYYYYY`).
3. Repeat for **Android** if you'll ship Android too (separate App ID).
4. For each app, **Ad units → Add ad unit**, create:
   - an **Interstitial** unit → save its id (`ca-app-pub-XXXX/ZZZZ`)
   - a **Rewarded** unit → save its id
5. Later, link a payments/tax profile in AdMob so you actually get paid. Not
   needed to build or ship.

## 2. Put your real ids in the app

- **`app.json`** → the `react-native-google-mobile-ads` plugin block: replace the
  two placeholder **App IDs** (`iosAppId`, `androidAppId`) — they currently hold
  Google's TEST app ids — with your real App IDs from step 1.
- **`eas.json`** → `build.preview.env` and `build.production.env`: replace the
  four `EXPO_PUBLIC_ADMOB_*` placeholders with your real **ad unit** ids. Leave a
  value as its `REPLACE_WITH_*` placeholder to keep using a test ad for that slot.

> In `__DEV__` builds the app ALWAYS uses test ad units regardless of the above
> (AdMob bans real ads in debug builds). Real units are used only in
> preview/production builds.

## 3. Backend — ALREADY DEPLOYED ✅ (via the web repo / Lovable)

The entire shared backend for this feature was applied directly to the shared
Supabase project (`gizqpfbmqgwhbalywkqv`) through the **web repo**
(`closet-conjurer-app`, the Lovable project), which auto-deploys its edge
functions. Nothing to run here. What's live:

- **Migration** — `bonus_ai_cents` on `profiles`, the `ad_reward_grants` table,
  and the `consume_ai_bonus` / `grant_ai_reward` RPCs (with `EXECUTE` revoked
  from anon/authenticated — service-role only).
- **`ai-router.ts`** — the bonus-consume fallback, applied on top of the web
  repo's current file (so its `ai_unlimited` feature is preserved). All six AI
  edge functions were redeployed.
- **`admob-ssv`** edge function — deployed with `verify_jwt = false`.

> ⚠️ Do NOT run `supabase db push` from this mobile repo, and do NOT
> `cp supabase/web-repo-patches/_shared/ai-router.ts` over the web repo — that
> copy predates the web repo's `ai_unlimited` change and would regress it. The
> files under `supabase/migrations/`, `supabase/functions/admob-ssv/`, and
> `supabase/web-repo-patches/` in THIS repo are now **reference copies only**;
> the live versions were deployed via the web repo. (Re-running the migration
> would be harmless anyway — it's fully idempotent.)

## 4. Wire the rewarded SSV callback in AdMob

In AdMob → your **Rewarded** ad unit → **Server-side verification**, set the URL
to:

```
https://gizqpfbmqgwhbalywkqv.supabase.co/functions/v1/admob-ssv
```

Click **Verify URL**, then **Use verified URL**. (The app already sends the
Supabase user id as the SSV `userId`/`customData`, so the callback credits the
right account.)

## 5. App Store Connect (at submission)

- **App Privacy / IDFA**: answer **Yes** to "Does this app use the Advertising
  Identifier (IDFA)?" AdMob's page "How to complete the IDFA questionnaire" lists
  the exact boxes — check the ones for *serving ads* (and *attribution*). The ATT
  prompt string is already set (`app.json` → `userTrackingUsageDescription`).
- No StoreKit changes — ads are separate from the RevenueCat subscriptions.

## 6. Build & test

```bash
eas build --platform ios --profile production   # or --profile preview for TestFlight
```

On a real device (ads don't fill in the iOS Simulator):
- Free account → finish a try-on, tap **Try another** → interstitial (test ad).
- Free account at the AI limit → **Watch ad for a bonus** appears → watch →
  after a few seconds the extra action works. 4th time in a day → "come back
  tomorrow".
- Upgrade to Pro/Business → **no ads** anywhere.

---

### How the reward is kept honest (why the backend exists)

The AI limit is a server-side 30-day **dollar cap** (`ai-router.ts`). A rewarded
ad grants `bonus_ai_cents` **only** via the signature-verified `admob-ssv`
callback — the client can never grant itself allowance. `chargeAiSpend` spends
that bonus only when a user is over their cap. The 3/day cap is enforced on both
the client (instant UX) and the server (`grant_ai_reward`, replay-safe).
