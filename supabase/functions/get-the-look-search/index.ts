// Get the Look — NON-AI reverse image search.
//
// Replaces the token-burning `analyze-outfit` AI call with SerpAPI's Google
// Lens engine (flat-rate per query). Given a signed URL to the user's uploaded
// photo, it returns visual matches (shoppable look-alikes) the app presents as
// swipeable cards. No AI gateway, no LOVABLE_API_KEY, no per-token spend.
//
// Deploy to the SHARED Supabase project:
//   supabase secrets set SERPAPI_KEY=<key>
//   supabase functions deploy get-the-look-search --project-ref gizqpfbmqgwhbalywkqv
// (Keep JWT verification ON — we need to know WHO is calling for the abuse guard.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Identifier written to / counted in `ai_usage` for the lightweight daily guard.
const FN = 'get-the-look';
const DAILY_LIMIT = 20;

interface LookResult {
  title: string | null;
  link: string | null;
  source: string | null;
  thumbnail: string | null;
  price: number | null;
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

  // Parse input.
  let imageUrl: string | undefined;
  try {
    const body = await req.json();
    imageUrl = body?.imageUrl;
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (!imageUrl || typeof imageUrl !== 'string') {
    return json({ error: 'imageUrl is required' }, 400);
  }

  const serpKey = Deno.env.get('SERPAPI_KEY');
  if (!serpKey) {
    console.error('get-the-look-search: SERPAPI_KEY not configured');
    return json({ error: 'Search is temporarily unavailable.' }, 500);
  }

  const admin = createClient(url, serviceKey);

  // --- Lightweight abuse guard: cap searches per user per day. ---
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
        { error: "You've reached today's Get the Look limit. Try again tomorrow." },
        429,
      );
    }
  } catch (e) {
    // A schema mismatch on the guard must never block the search itself.
    console.error('get-the-look-search: usage guard failed (continuing)', e);
  }

  // --- Reverse image search via SerpAPI Google Lens. ---
  let results: LookResult[] = [];
  try {
    const endpoint = `https://serpapi.com/search.json?engine=google_lens&url=${encodeURIComponent(
      imageUrl,
    )}&api_key=${serpKey}`;
    const res = await fetch(endpoint);
    if (!res.ok) {
      console.error('get-the-look-search: SerpAPI HTTP', res.status);
      return json({ error: 'Search failed. Please try again.' }, 502);
    }
    const data = await res.json();
    const matches: any[] = Array.isArray(data?.visual_matches) ? data.visual_matches : [];
    results = matches.map((m) => ({
      title: m?.title ?? null,
      link: m?.link ?? null,
      source: m?.source ?? null,
      thumbnail: m?.thumbnail ?? null,
      // SerpAPI returns price.value as a display string ("$59.00*");
      // extracted_value is the numeric form.
      price:
        typeof m?.price?.extracted_value === 'number'
          ? m.price.extracted_value
          : typeof m?.price?.value === 'number'
            ? m.price.value
            : null,
    }));
  } catch (e) {
    console.error('get-the-look-search: SerpAPI call failed', e);
    return json({ error: 'Search failed. Please try again.' }, 502);
  }

  // --- Optional ranking: float the user's favorite stores to the top. ---
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const prefs = (profile?.preferences ?? {}) as { stores?: unknown };
    const favorites = Array.isArray(prefs.stores)
      ? prefs.stores.filter((s): s is string => typeof s === 'string').map((s) => s.toLowerCase())
      : [];
    if (favorites.length) {
      const isFavorite = (r: LookResult) => {
        const hay = `${r.source ?? ''} ${r.title ?? ''}`.toLowerCase();
        return favorites.some((f) => f && hay.includes(f));
      };
      // Stable partition: favorites first, everything else after, original order kept.
      results = [...results.filter(isFavorite), ...results.filter((r) => !isFavorite(r))];
    }
  } catch (e) {
    console.error('get-the-look-search: preference ranking skipped', e);
  }

  // --- Record the (near-zero-cost) usage. Defensive so schema drift can't fail the search. ---
  try {
    await admin.from('ai_usage').insert({
      user_id: user.id,
      function_name: FN,
      cost_cents: 0,
    });
  } catch (e) {
    console.error('get-the-look-search: usage insert failed (ignored)', e);
  }

  return json({ results }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
