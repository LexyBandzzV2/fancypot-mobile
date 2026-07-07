# Backend patch: rate-limit `wardrobe-process`

During the audit, `supabase/functions/wardrobe-process/index.ts` (in the
`closet-conjurer-app` web repo) was the **only** AI edge function that called AI
models (classification + background removal) **without** going through
`chargeAiSpend()`. Every other function (`analyze-outfit`, `generate-outfit`,
`try-on`, `recommend-pieces`, `feed-refresh`) already enforces auth + per-tier
spend caps + rate limits (10/min, 60/hr, 200/day) via
`_shared/ai-router.ts::chargeAiSpend`.

Close the gap so uploads can't be used to bypass limits.

### The change

In `supabase/functions/wardrobe-process/index.ts`, right after the existing
`requireUser(req)` call, add the same guard the other functions use:

```ts
import { requireUser, chargeAiSpend } from "../_shared/ai-router.ts";

// ...inside the handler, after you resolve the user:
const { user } = await requireUser(req);

// NEW: enforce tier limit + rate limit + spend cap before doing any AI work.
// wardrobe-process runs 2 model calls (classify + bg-removal), so charge ~2¢.
await chargeAiSpend(user.id, "wardrobe-process", req);
```

`chargeAiSpend` throws a `Response` with status 429 (rate limited) / 402-403
(over limit / blocked) that the client already understands
(`src/lib/api.ts::UsageLimitError`), so the mobile UI will surface the right
message with no extra work.

### Deploy

```bash
supabase functions deploy wardrobe-process --project-ref gizqpfbmqgwhbalywkqv
```

> Note: this file is a documented patch because the function's source lives in
> the web repo. Apply it there (or wherever you keep the canonical backend) and
> redeploy to the shared Supabase project.
