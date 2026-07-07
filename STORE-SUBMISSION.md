# App Store & Google Play Submission Checklist

Fancy Pot mobile · bundle id `org.fancypot.app`

## 0. Prerequisites

- [ ] Apple Developer Program membership ($99/yr) + App Store Connect access
- [ ] Google Play Developer account ($25 one-time)
- [ ] RevenueCat project with `pro` and `business` entitlements configured
- [ ] Supabase edge functions deployed (`revenuecat-webhook`, `delete-account`) — see README
- [ ] `eas.json` placeholders filled: `appleId`, `ascAppId`, `appleTeamId`

## 1. In-app purchases (do this BEFORE the first production build)

**App Store Connect → Subscriptions**
- [ ] Create a subscription group "Fancy Pot"
- [ ] Add auto-renewable subscriptions: Pro (monthly), Business (monthly)
- [ ] Localized display name, description, price for each
- [ ] Add products to the RevenueCat `pro` / `business` entitlements

**Play Console → Monetize → Subscriptions**
- [ ] Create the same two subscriptions with base plans
- [ ] Link them in RevenueCat
- [ ] Upload a Play service account JSON for `eas submit` (`play-service-account.json`, gitignored)

## 2. Assets

- [ ] App icon 1024×1024 (no alpha) — replace `assets/icon.png` with brand icon
- [ ] Adaptive Android icon foreground/monochrome — `assets/android-icon-*.png`
- [ ] Splash screen on cream `#FAF3E7` — `assets/splash-icon.png`
- [ ] Screenshots: iPhone 6.7" & 6.5", iPad 12.9" (if tablet), Android phone/tablet
- [ ] Feature graphic 1024×500 (Play)

## 3. Store listing copy

- [ ] Name: **Fancy Pot**  ·  Subtitle: "Your private AI stylist"
- [ ] Description covering: closet, AI outfits, get-the-look, virtual try-on, style feed
- [ ] Keywords, category (Lifestyle / Shopping), support URL `https://fancypot.org/support`
- [ ] Marketing URL `https://fancypot.org`

## 4. Legal & privacy (App Store 5.1.1 / Play Data safety)

- [ ] Privacy Policy URL: `https://fancypot.org/privacy` (linked in-app: Profile → Privacy)
- [ ] Terms of Use URL: `https://fancypot.org/terms` (Apple requires EULA for auto-renew subs)
- [ ] **Account deletion** works in-app: Profile → Delete account (calls `delete-account` fn) ✅
- [ ] App Privacy questionnaire: declare Photos (app functionality), Email (account),
      Purchases, Identifiers. No tracking across apps.
- [ ] Play Data safety form mirroring the above

## 5. Permissions copy (already in `app.json`)

- [ ] Camera — "photograph clothing for your closet and virtual try-ons" ✅
- [ ] Photo library — "add clothing to your closet and try on outfits" ✅
- [ ] `ITSAppUsesNonExemptEncryption: false` set ✅

## 6. Build & upload

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

- [ ] Increment `ios.buildNumber` / `android.versionCode` per submission
      (`autoIncrement` is on for the production profile)

## 7. App Review notes (paste into "Notes for Review")

- [ ] Provide a **demo account** (email + password) with an active closet + a Pro entitlement
      granted in RevenueCat sandbox, so reviewers can exercise gated AI features
- [ ] Note: "All AI runs server-side via Supabase Edge Functions; no AI keys ship in the app."
- [ ] Note: subscriptions managed by RevenueCat; restore purchases available on Paywall & Profile
- [ ] Confirm account deletion path: Profile → Delete account

## 8. Post-submit

- [ ] TestFlight internal test passes (auth, purchase in sandbox, AI limit → paywall, restore)
- [ ] Play internal testing track passes the same flows
- [ ] Verify a web-created account logs in on mobile and sees the same closet/plan
