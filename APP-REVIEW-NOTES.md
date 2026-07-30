DEMO ACCOUNT — PLEASE USE THIS ONE
Email: fancypot.testreview@gmail.com
Password: <<< FILL IN >>>
Pre-seeded with a Pro plan and closet items, so every feature is testable right away.

1) 2.1(b) — IAP products not submitted
Both subscriptions are submitted with this binary, in group "Pro":
- fancypot_pro_monthly2 — $6.99/mo, shown in-app as "Pro"
- fancypot_ultimate_monthly — $14.99/mo, shown in-app as "Business"
("Ultimate Monthly" is the internal reference name for the "Business" tier.)

2) 2.1(b) — "issue with configuration" on purchase
Two causes, both fixed. The Paid Apps Agreement was not in effect and has now been accepted by the Account Holder. The previous Pro product record had become orphaned in App Store Connect and could no longer be resolved by StoreKit; it was replaced with fancypot_pro_monthly2 and re-linked in RevenueCat, the StoreKit wrapper this app uses.
Purchase screen: Profile tab -> Upgrade.

3) 2.3.10 — Google Play references
Removed from the binary and from the screenshots. The entire Android surface has been deleted from the project; this is an iOS-only app.
For clarity: the app uses Google's Gemini models as a backend AI service. That is Google Cloud AI, not Google Play or an alternative app marketplace, and it is disclosed to users by name (below).

4) 5.1.1(i) and 5.1.2(i) — AI data disclosure and consent
The previous build did contain a consent disclosure, but it was unreachable: a phone-verification step ran ahead of it and could not be passed without SMS, so it was never seen. That is fixed. The app now discloses in two places.

a) A full disclosure screen, once per account, before the app can be used. It cannot be skipped. It states what data is collected, how it is collected, every use of it, each third party that receives it and what each one gets, and confirms those processors are contractually bound to provide the same or equivalent protection. It links to the Privacy Policy and Terms. Any new account sees it immediately.

b) A separate Allow / Don't Allow prompt for each AI feature, shown at the moment of sharing and before anything is transmitted. Each names the exact data sent and the recipient. Declining leaves that feature off and the rest of the app usable. Revocable any time in Settings -> Account.
Where to trigger each:
- Closet tab -> add a photo = background removal (Google Gemini via Lovable AI Gateway)
- Style -> Style Me = outfit styling (same)
- Style -> Virtual Try-On = virtual try-on (same)
- Style -> Get the Look = look matching (SerpAPI / Google Lens)
- Saved -> open a look = piece recommendations (same)

Privacy policy: https://fancypot.org/privacy — identifies what is collected, how, all uses, names Google LLC (Gemini), Lovable Labs, and SerpAPI, and states they provide the same or equivalent level of protection.

NOTE: Phone verification is optional. "Skip for now" dismisses it and it never blocks any feature. Sign in with Apple and email + password both work.
