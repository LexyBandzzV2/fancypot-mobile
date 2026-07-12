// Fresh feed — NON-AI product search.
//
// Pulls current product listings for the user's favorite stores via SerpAPI's
// Google Shopping engine (flat-rate per query, no AI tokens). Results are
// cached server-side per (brand, style) for CACHE_TTL_HOURS so repeated feed
// pulls are free.
//
// Deploy to the SHARED Supabase project:
//   supabase functions deploy feed-fresh --project-ref gizqpfbmqgwhbalywkqv
// (Uses the same SERPAPI_KEY secret as get-the-look-search — nothing new to
// set if that's already configured.)
// (Keep JWT verification ON — we need to know WHO is calling for the daily
// guard and to read their saved stores/styles.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Identifier written to / counted in `ai_usage` for the lightweight daily guard.
const FN = 'feed-fresh';
const DAILY_LIMIT = 40;

// At most this many of the user's saved brands are fetched per invocation —
// keeps a single feed pull fast and bounds worst-case SerpAPI spend.
const MAX_BRANDS_PER_CALL = 4;

// How long a cached (brand, style) result set is considered fresh.
const CACHE_TTL_HOURS = 6;

// Mirrors src/lib/api.ts::FeedProduct — keep in sync.
interface FeedProduct {
  id: string;
  brand: string | null;
  name: string | null;
  price: number | null;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  style_tags: string[] | null;
  budget_tier: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const serpKey = Deno.env.get('SERPAPI_KEY');

  // Identify the caller from their JWT.
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await asUser.auth.getUser();
  if (userErr || !user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  // Parse + validate input. `store` is optional; when present it's a single
  // brand the client wants prioritized (still constrained to the user's own
  // saved stores below — see the brand-selection step).
  let body: { store?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const storeInput = body?.store;
  if (storeInput !== undefined && (typeof storeInput !== 'string' || storeInput.length > 40)) {
    return json({ error: 'store must be a string of 40 characters or fewer' }, 400);
  }
  const requestedStore = typeof storeInput === 'string' ? storeInput : undefined;

  const admin = createClient(url, serviceKey);

  // --- Lightweight abuse guard: cap fresh-feed pulls per user per day. ---
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  try {
    const { count } = await admin
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('function_name', FN)
      .gte('created_at', startOfDay.toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json(
        { error: "You've reached today's Fresh Feed limit. Try again tomorrow." },
        429,
      );
    }
  } catch (e) {
    // A schema mismatch on the guard must never block the feed pull itself.
    console.error('feed-fresh: usage guard failed (continuing)', e);
  }

  // --- Read the caller's saved stores/styles. This (unlike get-the-look-
  // search's optional ranking step) is NOT best-effort: it's the input that
  // decides which brands we're even allowed to query, so a lookup failure
  // fails the request rather than silently falling back to "no stores"
  // (which would otherwise let an arbitrary `store` body value through).
  let savedStores: string[];
  let savedStyles: string[];
  try {
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;
    const prefs = (profile?.preferences ?? {}) as { stores?: unknown; styles?: unknown };
    savedStores = Array.isArray(prefs.stores)
      ? prefs.stores.filter((s): s is string => typeof s === 'string')
      : [];
    savedStyles = Array.isArray(prefs.styles)
      ? prefs.styles.filter((s): s is string => typeof s === 'string')
      : [];
  } catch (e) {
    console.error('feed-fresh: preferences lookup failed', e);
    return json({ error: 'Fresh feed is temporarily unavailable.' }, 500);
  }

  // --- Brand selection. If a single store was requested, only honor it when
  // it's one of the user's saved stores (case-insensitive) — or when they
  // haven't saved any stores yet, so a fresh signup can still try one brand.
  // Otherwise ignore the request and fall back to the full saved list; this
  // stops feed-fresh from being used as a free arbitrary-search proxy.
  let brands: string[];
  if (requestedStore !== undefined) {
    const matched = savedStores.find((s) => s.toLowerCase() === requestedStore.toLowerCase());
    if (matched) {
      brands = [matched]; // use the verbatim-saved casing, not the caller's input
    } else if (savedStores.length === 0) {
      brands = [requestedStore];
    } else {
      brands = savedStores;
    }
  } else {
    brands = savedStores;
  }

  if (brands.length === 0) {
    return json({ products: [], reason: 'no_stores' }, 200);
  }

  // Deterministic daily rotation: shift the brand list by day-of-year (mod
  // its length) before capping to MAX_BRANDS_PER_CALL. Without this, a user
  // with more than 4 saved stores would always see the same first 4 refreshed
  // and the rest would never get fetched; rotating means every saved brand
  // cycles to the front over the course of a week.
  const rotation = dayOfYear(new Date()) % brands.length;
  const rotated = [...brands.slice(rotation), ...brands.slice(0, rotation)];
  const selectedBrands = rotated.slice(0, MAX_BRANDS_PER_CALL);

  // Single style term used both in the SerpAPI query and the cache key.
  const style = savedStyles.length ? savedStyles[0].toLowerCase() : '';

  const cacheTtlMs = CACHE_TTL_HOURS * 60 * 60 * 1000;
  const perBrandResults: FeedProduct[][] = [];

  for (const brand of selectedBrands) {
    const brandKey = normalizeBrandKey(brand);
    let items: FeedProduct[] | null = null;

    // --- Cache lookup (best-effort; a lookup failure just means we re-fetch). ---
    try {
      const { data: cached } = await admin
        .from('feed_fresh_cache')
        .select('items, fetched_at')
        .eq('brand', brandKey)
        .eq('style', style)
        .maybeSingle();
      if (cached?.fetched_at && Array.isArray(cached.items)) {
        const fetchedAt = new Date(cached.fetched_at).getTime();
        if (Date.now() - fetchedAt < cacheTtlMs) {
          items = cached.items as FeedProduct[];
        }
      }
    } catch (e) {
      console.error('feed-fresh: cache lookup failed for brand (continuing)', brandKey, e);
    }

    if (!items) {
      if (!serpKey) {
        console.error('feed-fresh: SERPAPI_KEY not configured');
        return json({ error: 'Fresh feed is temporarily unavailable.' }, 500);
      }

      // --- Live SerpAPI Google Shopping search. A single brand's failure
      // here must not fail the whole request — log and move on. ---
      let fetched: FeedProduct[];
      try {
        const q = `${brand} ${style} clothing`.trim().replace(/\s+/g, ' ');
        const endpoint = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(
          q,
        )}&num=20&api_key=${serpKey}`;
        const res = await fetch(endpoint);
        if (!res.ok) {
          console.error('feed-fresh: SerpAPI HTTP', res.status, 'for brand', brandKey);
          continue;
        }
        const data = await res.json();
        const raw: any[] = Array.isArray(data?.shopping_results) ? data.shopping_results : [];
        fetched = raw
          .slice(0, 12)
          .map((r): FeedProduct | null => {
            const productUrl =
              (typeof r?.product_link === 'string' && r.product_link) ||
              (typeof r?.link === 'string' && r.link) ||
              null;
            const imageUrl = typeof r?.thumbnail === 'string' ? r.thumbnail : null;
            if (!productUrl || !imageUrl) return null;
            return {
              // 'fresh-' marks a synthetic, non-DB id: these products don't
              // exist as rows anywhere, so the client must never try to
              // write reactions (likes/saves) against them.
              id: `fresh-${brandKey}-${fnv1aHash(productUrl)}`,
              brand,
              name: typeof r?.title === 'string' ? r.title : null,
              price: typeof r?.extracted_price === 'number' ? r.extracted_price : null,
              image_url: imageUrl,
              product_url: productUrl,
              category: null,
              style_tags: style ? [style] : null,
              budget_tier: null,
            };
          })
          .filter((p): p is FeedProduct => p !== null);
      } catch (e) {
        console.error('feed-fresh: SerpAPI call failed for brand (skipping)', brandKey, e);
        continue;
      }

      items = fetched;

      // --- Cache write-through (best-effort; a failed write just means the
      // next call re-fetches — cache is a speed/cost optimization, not a
      // correctness requirement). ---
      try {
        await admin
          .from('feed_fresh_cache')
          .upsert(
            { brand: brandKey, style, items, fetched_at: new Date().toISOString() },
            { onConflict: 'brand,style' },
          );
      } catch (e) {
        console.error('feed-fresh: cache upsert failed for brand (ignored)', brandKey, e);
      }
    }

    perBrandResults.push(items ?? []);
  }

  // --- Interleave round-robin across brands (A1, B1, C1, A2, B2, C2, ...) so
  // one brand's 12 results don't bury the others at the top of the feed. ---
  const MAX_TOTAL = 48;
  const products: FeedProduct[] = [];
  const maxLen = perBrandResults.reduce((m, r) => Math.max(m, r.length), 0);
  outer: for (let i = 0; i < maxLen; i++) {
    for (const brandItems of perBrandResults) {
      if (i < brandItems.length) {
        products.push(brandItems[i]);
        if (products.length >= MAX_TOTAL) break outer;
      }
    }
  }

  // --- Record the (zero-cost) usage. Defensive so schema drift can't fail the pull. ---
  try {
    await admin.from('ai_usage').insert({
      user_id: user.id,
      function_name: FN,
      cost_cents: 0,
    });
  } catch (e) {
    console.error('feed-fresh: usage insert failed (ignored)', e);
  }

  return json({ products }, 200);
});

// Lowercase, alphanumeric-only brand key — stable across "H&M" / "h & m" /
// "H & M Official" style variations, used for both the cache key and the
// synthetic product id prefix.
function normalizeBrandKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Days since Jan 1 of `d`'s year (UTC), used only to pick a deterministic,
// slowly-changing rotation offset — doesn't need to be calendar-precise.
function dayOfYear(d: Date): number {
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const startOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((startOfDay - startOfYear) / 86400000);
}

// Tiny fnv1a-style string hash so synthetic product ids are stable across
// requests (same link -> same id) without pulling in a crypto dependency.
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
