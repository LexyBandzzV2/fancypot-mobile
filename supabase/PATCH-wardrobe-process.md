# Backend patch: rate-limit `wardrobe-process`

*[← README](../README.md) · See also: [../COMPLIANCE.md](../COMPLIANCE.md) § D (AI safety & security) · [web-repo-patches/README.md](./web-repo-patches/README.md) (deploy status)*

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

**3. Store the object path, not a public URL** — after uploading the
background-removed image, the function used to call
`admin.storage.from("wardrobe").getPublicUrl(newPath)` and write the resulting
public URL into `wardrobe_items.image_url`. The `wardrobe` bucket is private,
so a "public" URL is both non-functional and inconsistent with the mobile
client, which stores bare object paths (`userId/uuid.ext`, no bucket prefix —
see `src/lib/storage.ts::uploadWardrobeImage`) and signs them on demand
(`signWardrobeUrl`). The patched function now writes `newPath` directly:

```ts
cleanedPath = newPath; // object path, e.g. "userId/uuid.png" — no getPublicUrl
...
if (cleanedPath) updates.image_url = cleanedPath;
```

It also tolerates `image_url` holding either a bare object path (the new
convention) or a legacy full storage URL when resolving the source image.

### Deploy

```bash
supabase functions deploy wardrobe-process --project-ref gizqpfbmqgwhbalywkqv
```

> Note: this file is a documented patch because the function's source lives in
> the web repo. Apply it there (or wherever you keep the canonical backend) and
> redeploy to the shared Supabase project.
