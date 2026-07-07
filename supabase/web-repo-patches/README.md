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
