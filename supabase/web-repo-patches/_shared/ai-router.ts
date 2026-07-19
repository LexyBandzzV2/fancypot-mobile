// Centralized AI model routing.
// Pick the right model per task instead of using one model everywhere —
// fast/cheap for classification/structured-output, vision-strong for image
// understanding, image model for generation.

export type AiTask =
  | "vision-analyze"      // look at an outfit photo and break it down
  | "vision-recommend"    // look at an outfit + recommend complementary pieces
  | "text-structured"     // pure text reasoning with tool-calling
  | "image-generate"      // produce a new image
  | "image-edit";         // edit an image (try-on)

export function pickModel(task: AiTask): string {
  switch (task) {
    case "vision-analyze":
    case "vision-recommend":
      return "google/gemini-2.5-flash";       // strong vision + cheap
    case "text-structured":
      return "google/gemini-2.5-flash-lite";  // fastest for short structured text
    case "image-generate":
    case "image-edit":
      return "google/gemini-3-pro-image-preview"; // Nano Banana Pro - higher quality
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function aiErrorResponse(status: number, fallback = "AI request failed") {
  if (status === 429) return jsonResponse({ error: "Rate limit reached. Try again in a moment." }, 429);
  if (status === 402) return jsonResponse({ error: "AI credits exhausted. Add credits in workspace settings." }, 402);
  return jsonResponse({ error: fallback }, 500);
}

// Shared style-profile prompt fragment so every model call respects
// the user's saved aesthetic + budget + favorite color stories.
export type StyleProfile = {
  styles?: string[];
  budget?: string;
  stores?: string[];
};

export function styleProfileBlock(p: StyleProfile | undefined | null): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.styles?.length) parts.push(`Aesthetic affinities: ${p.styles.join(", ")}.`);
  if (p.budget)         parts.push(`Budget tier: ${p.budget}.`);
  if (p.stores?.length) parts.push(`Favored brands: ${p.stores.slice(0, 8).join(", ")}.`);
  return parts.length
    ? `\n\nSTYLE PROFILE — honor this strictly:\n- ${parts.join("\n- ")}\n`
    : "";
}

// Shared color-matching guidance for outfit composition.
export const COLOR_MATCHING_RULES = `
COLOR MATCHING RULES — use these when assembling or recommending an outfit:
1. Identify the dominant color of each provided piece.
2. Build the look around a coherent palette using one of these strategies:
   - Monochrome (varied tones of one hue)
   - Analogous (neighbors on the color wheel, e.g. blush + cream + camel)
   - Complementary accent (one pop color against neutrals)
   - Tonal neutrals (cream, ivory, taupe, soft black)
3. Avoid clashing saturated hues unless the user's aesthetic explicitly calls for it (Y2K, maximalist).
4. Match metals + leather tones to the palette (warm gold with warm tones, silver with cool tones).
`.trim();

// Verify that the caller is an authenticated Supabase user.
// Returns the user object on success, or a 401 Response on failure.
// Use to gate AI / cost-bearing edge functions against anonymous abuse.
import { createClient } from "jsr:@supabase/supabase-js@2";
export async function requireUser(req: Request): Promise<{ user: { id: string; email?: string } } | Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !ANON) return jsonResponse({ error: "server misconfigured" }, 500);
  const client = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return jsonResponse({ error: "unauthorized" }, 401);
  return { user: { id: data.user.id, email: data.user.email ?? undefined } };
}

// ----- Per-plan AI spend caps (rolling 30 days) -----
// Hard ceilings on Lovable AI / Firecrawl spend per user, enforced server-side.
// Caps in USD cents; mirrors public.ai_spend_cap_cents_for_plan in the DB.
export const AI_SPEND_CAP_CENTS: Record<string, number> = {
  free: 25,       // $0.25
  pro: 100,       // $1.00
  ultimate: 250,  // $2.50
};

// Estimated cost (USD cents) per AI edge function invocation. Conservative
// upper bounds — better to over-charge against the cap than under-charge.
export type AiFunction = "try-on" | "generate-outfit" | "analyze-outfit" | "recommend-pieces" | "feed-refresh" | "wardrobe-process";
export const AI_FUNCTION_COST_CENTS: Record<AiFunction, number> = {
  "try-on": 4,            // Nano Banana Pro image edit
  "generate-outfit": 4,   // Nano Banana Pro image generation
  "analyze-outfit": 5,    // vision call + downstream image gens
  "recommend-pieces": 2,  // vision + Firecrawl search
  "feed-refresh": 2,      // batched Firecrawl + structured extraction
  "wardrobe-process": 4,  // classify vision call + background-removal image edit
};

// ----- Short-window rate limits (per user, all plans) -----
// Well above any legitimate hand-driven use. Trips only bots / scripts.
const RATE_LIMITS = [
  { windowMs: 60 * 1000,          max: 10,  label: "per minute" },
  { windowMs: 60 * 60 * 1000,     max: 60,  label: "per hour"   },
  { windowMs: 24 * 60 * 60 * 1000, max: 200, label: "per day"    },
];

// Global daily circuit breaker (cents). If total AI spend across ALL users in
// the last 24h exceeds this, refuse new AI calls until it drops.
const GLOBAL_DAILY_CAP_CENTS = Number(Deno.env.get("AI_GLOBAL_DAILY_CAP_CENTS") || 2500); // $25/day default

/**
 * Enforce ALL abuse protections before an AI call:
 *  - admin block flag on the user
 *  - short-window rate limits (minute / hour / day)
 *  - per-plan 30-day dollar cap
 *  - global 24h circuit breaker
 * On success, records the estimated cost + request metadata in `ai_usage`
 * and returns null. On any refusal, returns a Response (402/403/429/503)
 * the handler should return directly.
 */
export async function chargeAiSpend(userId: string, fn: AiFunction, req?: Request): Promise<Response | null> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse({ error: "server misconfigured" }, 500);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: profile } = await admin
    .from("profiles").select("plan, ai_blocked, ai_block_reason").eq("user_id", userId).maybeSingle();
  const p = (profile as { plan?: string; ai_blocked?: boolean; ai_block_reason?: string } | null);
  if (p?.ai_blocked) {
    return jsonResponse({
      error: "account_blocked",
      message: p.ai_block_reason || "This account has been blocked from AI features. Contact support.",
    }, 403);
  }
  const plan = (p?.plan || "free").toLowerCase();
  const cap = AI_SPEND_CAP_CENTS[plan] ?? AI_SPEND_CAP_CENTS.free;
  const cost = AI_FUNCTION_COST_CENTS[fn];

  // Short-window rate limits (per user).
  for (const rule of RATE_LIMITS) {
    const since = new Date(Date.now() - rule.windowMs).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= rule.max) {
      return jsonResponse({
        error: "rate_limited",
        message: `Too many AI requests ${rule.label}. Slow down and try again shortly.`,
      }, 429);
    }
  }

  // Global 24h circuit breaker.
  const { data: globalRow } = await admin.rpc("global_ai_spend_last_24h_cents");
  const globalSpent = Number(globalRow ?? 0);
  if (globalSpent + cost > GLOBAL_DAILY_CAP_CENTS) {
    console.error("GLOBAL_AI_CIRCUIT_BREAKER_TRIPPED", { globalSpent, cap: GLOBAL_DAILY_CAP_CENTS });
    return jsonResponse({
      error: "temporarily_unavailable",
      message: "AI is temporarily unavailable due to high global demand. Please try again later.",
    }, 503);
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("ai_usage")
    .select("cost_cents")
    .eq("user_id", userId)
    .gte("created_at", since);
  const spent = (rows || []).reduce((s: number, r: { cost_cents: number | string }) => s + Number(r.cost_cents), 0);

  if (spent + cost > cap) {
    // Over the plan cap — before refusing, try to cover the overflow with
    // rewarded-ad bonus allowance (earned only via verified AdMob SSV, see the
    // admob-ssv edge function). consume_ai_bonus atomically debits the balance;
    // when the user has no bonus (the common case) it consumes nothing and we
    // refuse exactly as before, so paying users are entirely unaffected.
    const overflow = spent + cost - cap;
    const { data: consumed } = await admin.rpc("consume_ai_bonus", {
      p_user_id: userId,
      p_cents: overflow,
    });
    if (Number(consumed ?? 0) < overflow) {
      return jsonResponse({
        error: "ai_spend_cap_reached",
        message: `You've reached your ${plan} plan's AI spend limit ($${(cap / 100).toFixed(2)} per 30 days). Upgrade or wait for it to reset.`,
        plan,
        cap_usd: cap / 100,
        spent_usd: spent / 100,
      }, 402);
    }
    // Bonus covered the overflow — fall through to record usage and allow.
  }

  // Capture request metadata for abuse triage.
  const ip = req?.headers.get("cf-connecting-ip")
    || req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || null;
  const ua = req?.headers.get("user-agent") || null;

  // Record charge before invoking the model so a failure mid-call still
  // counts toward the cap (prevents retry-storm credit drain).
  await admin.from("ai_usage").insert({
    user_id: userId,
    function_name: fn,
    cost_cents: cost,
    ip_address: ip,
    user_agent: ua,
  });
  return null;
}