# Backend patch: rate-limit `wardrobe-process`

During the audit, `supabase/functions/wardrobe-process/index.ts` (in the
`closet-conjurer-app` web repo) was the **only** AI edge function that called AI
models (classification + background removal) **without** going through
`chargeAiSpend()`. Every other function (`analyze-outfit`, `generate-outfit`,
`try-on`, `recommend-pieces`, `feed-refresh`) already enforces auth + per-tier
spend caps + rate limits (10/min, 60/hr, 200/day) via
`_shared/ai-router.ts::chargeAiSpend`.

Close the gap so uploads can't be used to bypass limits.

### Actual helper signatures (from `_shared/ai-router.ts`)

```ts
// Returns the authed user, or a 401 Response to return directly — never throws.
export async function requireUser(
  req: Request
): Promise<{ user: { id: string; email?: string } } | Response>;

// Records the charge and enforces admin-block / rate-limit / 30-day spend cap /
// global circuit breaker. Returns null on success, or a Response (402/403/429/503)
// to return directly on refusal — never throws.
export async function chargeAiSpend(
  userId: string,
  fn: AiFunction,
  req?: Request
): Promise<Response | null>;
```

`AiFunction` is a closed union (`"try-on" | "generate-outfit" | "analyze-outfit"
| "recommend-pieces" | "feed-refresh"`) mapped to per-call cost estimates in
`AI_FUNCTION_COST_CENTS`. It did not include `wardrobe-process`, so the type and
cost table both needed a new entry — not just a call site fix.

### The change actually applied

**1. `supabase/functions/_shared/ai-router.ts`** — added `wardrobe-process` to
the `AiFunction` union and gave it a cost entry (4¢, same tier as `try-on` /
`generate-outfit`, since one of its two calls is an image-edit-class model call
just like those):

```ts
export type AiFunction = "try-on" | "generate-outfit" | "analyze-outfit" | "recommend-pieces" | "feed-refresh" | "wardrobe-process";
export const AI_FUNCTION_COST_CENTS: Record<AiFunction, number> = {
  "try-on": 4,            // Nano Banana Pro image edit
  "generate-outfit": 4,   // Nano Banana Pro image generation
  "analyze-outfit": 5,    // vision call + downstream image gens
  "recommend-pieces": 2,  // vision + Firecrawl search
  "feed-refresh": 2,      // batched Firecrawl + structured extraction
  "wardrobe-process": 4,  // classify vision call + background-removal image edit
};
```

**2. `supabase/functions/wardrobe-process/index.ts`** — the file already called
`requireUser`, but never called `chargeAiSpend`. Import it and insert the guard
immediately after auth, before the (currently un-metered) AI work is kicked off:

```ts
import { corsHeaders, jsonResponse, requireUser, chargeAiSpend } from "../_shared/ai-router.ts";
```

```ts
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;
    const capped = await chargeAiSpend(userId, "wardrobe-process", req);
    if (capped) return capped;

    const { itemId } = await req.json();
```

This matches `analyze-outfit`'s idiom exactly (`if (auth instanceof Response) return auth;` then `if (capped) return capped;`) — `chargeAiSpend` does NOT throw, it returns a `Response | null` that the handler must check and return itself.

### Deploy

```bash
supabase functions deploy wardrobe-process --project-ref gizqpfbmqgwhbalywkqv
```

> Note: this file is a documented patch because the function's source lives in
> the web repo. Apply it there (or wherever you keep the canonical backend) and
> redeploy to the shared Supabase project.
