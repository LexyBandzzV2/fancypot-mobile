> ⚠️ **Status: the rewarded-ad bonus changes here are ALREADY DEPLOYED** to the
> shared Supabase project via the web repo (`closet-conjurer-app`, the Lovable
> project) — migration, the `ai-router.ts` bonus-consume fallback (applied on top
> of the web repo's current file, preserving its `ai_unlimited` feature), and the
> `admob-ssv` function. **Do NOT `cp` `_shared/ai-router.ts` from here over the
> web repo** — this copy predates `ai_unlimited` and would regress it. Everything
> below is retained as historical reference for the wardrobe-process work.

# Patched web-repo edge functions (ready to copy)

These are the **fully patched** versions of two files from the web repo
(`closet-conjurer-app`), adding tier/rate-limit enforcement to `wardrobe-process`
(the one AI function that lacked it). See `../PATCH-wardrobe-process.md` for the
exact diff and rationale.

To apply: copy both files over their counterparts in the web repo, then deploy:

```bash
cp wardrobe-process/index.ts  <web-repo>/supabase/functions/wardrobe-process/index.ts
cp _shared/ai-router.ts       <web-repo>/supabase/functions/_shared/ai-router.ts
cd <web-repo>
supabase functions deploy wardrobe-process --project-ref gizqpfbmqgwhbalywkqv
```

Note: `_shared/ai-router.ts` is shared by all AI functions — the change is additive
(extends the `AiFunction` union + cost table with `"wardrobe-process": 4`), so the
other functions are unaffected, but redeploying them picks up the same file harmlessly.

## Rewarded-ad bonus allowance (added for mobile ads)

`_shared/ai-router.ts` now also consults a per-user bonus balance when a user is
over their plan's 30-day dollar cap (see the `spent + cost > cap` block). This
powers "watch a rewarded ad → one extra try-on" for free users. The change is
**purely additive**: when a user has no bonus (`bonus_ai_cents = 0`, the default
for everyone), `consume_ai_bonus` returns 0 and the function refuses exactly as
before — paying users and non-ad-watchers are unaffected.

**Apply in this order** (the patched router calls a new RPC, so the DB migration
must land first):

1. Apply the migration to the shared project (adds `bonus_ai_cents`,
   `ad_reward_grants`, and the `consume_ai_bonus` / `grant_ai_reward` RPCs):
   ```bash
   supabase db push --project-ref gizqpfbmqgwhbalywkqv
   ```
2. Copy the patched router into the web repo and redeploy the AI functions that
   import it (or at least `wardrobe-process`; all share the file):
   ```bash
   cp _shared/ai-router.ts <web-repo>/supabase/functions/_shared/ai-router.ts
   cd <web-repo> && supabase functions deploy wardrobe-process --project-ref gizqpfbmqgwhbalywkqv
   ```
   (Even if step 2 is skipped, nothing breaks — the RPC just goes unused and
   over-cap users keep getting the normal 402. Rewards simply won't apply until
   the router is redeployed.)
3. Deploy the SSV callback that grants the bonus (lives in THIS repo under
   `supabase/functions/admob-ssv`, deployed to the same shared project):
   ```bash
   supabase functions deploy admob-ssv --no-verify-jwt --project-ref gizqpfbmqgwhbalywkqv
   ```
