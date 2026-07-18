// Monthly feed scraper — populates feed_scraped_products with real, currently
// listed items from every brand in catalog.ts via SerpAPI Google Shopping
// (flat-rate per query, no AI tokens). Each row keeps the live product_url so
// the app can deep-link users straight to the retailer to buy.
//
// Invocation: scheduled monthly by pg_cron (see
// migrations/*_feed_monthly_scrape_cron.sql) with the service-role key as the
// bearer token. It can also be invoked manually with a dedicated operator key
// to seed the table on demand:
//
//   curl -X POST https://gizqpfbmqgwhbalywkqv.supabase.co/functions/v1/feed-scrape \
//     -H "Authorization: Bearer <FEED_SCRAPE_OPERATOR_KEY>" \
//     -H "Content-Type: application/json" -d '{}'
//
// Deploy:
//   supabase functions deploy feed-scrape --project-ref gizqpfbmqgwhbalywkqv --no-verify-jwt
// (JWT verification off because pg_net's call carries the service key, not a
// user JWT — the handler enforces the credential itself below.)
//
// Auth accepts exact, timing-safe matches against EITHER:
//   - SUPABASE_SERVICE_ROLE_KEY (the pg_cron path, via the
//     feed_refresh_service_key vault secret)
//   - FEED_SCRAPE_OPERATOR_KEY (a separate secret for manual/ops-triggered
//     runs, so on-demand seeding never requires handling the service-role key)
// Deliberately NOT JWT-based: decoding a JWT's `role` claim without verifying
// its signature lets anyone forge a token claiming service_role. Both
// candidates here are plain secrets compared byte-for-byte in constant time.
//
// Body (all optional):
//   { "batch": 0, "batches": 4 }  — process only slice `batch` of `batches`
//     equal slices of the catalog. Lets operators split a run to stay inside
//     SerpAPI quota or edge-function wall-clock limits. Default: whole catalog.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BRAND_CATALOG, type CatalogBrand } from './catalog.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Concurrent SerpAPI fetches. 6 keeps a full-catalog run around a minute
// without hammering SerpAPI's per-second limits.
const CONCURRENCY = 6;

// Products kept per brand per run.
const PER_BRAND = 12;

// Rows for a brand older than this are deleted after a successful refresh of
// that brand, so dead listings age out but a failed month never wipes data.
const STALE_DAYS = 60;

interface ScrapedRow {
  brand: string;
  brand_key: string;
  name: string | null;
  price: number | null;
  image_url: string;
  product_url: string;
  category: string | null;
  style_tags: string[];
  budget_tier: string;
  scraped_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const operatorKey = Deno.env.get('FEED_SCRAPE_OPERATOR_KEY');
  const serpKey = Deno.env.get('SERPAPI_KEY');

  // Operator-only endpoint: accept an exact, timing-safe match against either
  // the service-role key (pg_cron, via vault) or a dedicated operator key
  // (manual/ops-triggered runs). User JWTs are rejected outright — this
  // function spends the SerpAPI budget for the whole catalog and must not be
  // callable by app clients. No JWT decoding: reading a `role` claim without
  // verifying the token's signature would let anyone forge one.
  const authHeader = req.headers.get('Authorization') ?? '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const authorized =
    timingSafeEqualStr(presented, serviceKey) ||
    (!!operatorKey && timingSafeEqualStr(presented, operatorKey));
  if (!authorized) {
    return json({ error: 'Forbidden' }, 403);
  }

  if (!serpKey) {
    console.error('feed-scrape: SERPAPI_KEY not configured');
    return json({ error: 'SERPAPI_KEY not configured' }, 500);
  }

  // Optional batching input.
  let batch: number | undefined;
  let batches: number | undefined;
  try {
    const body = await req.json();
    if (Number.isInteger(body?.batch)) batch = body.batch;
    if (Number.isInteger(body?.batches)) batches = body.batches;
  } catch {
    // empty body is fine — full catalog run
  }

  let brands: CatalogBrand[] = BRAND_CATALOG;
  if (batch !== undefined && batches !== undefined && batches > 0 && batch >= 0 && batch < batches) {
    const per = Math.ceil(BRAND_CATALOG.length / batches);
    brands = BRAND_CATALOG.slice(batch * per, (batch + 1) * per);
  }

  const admin = createClient(url, serviceKey);
  const startedAt = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();

  let okBrands = 0;
  let failedBrands = 0;
  let totalRows = 0;

  const scrapeBrand = async (entry: CatalogBrand): Promise<void> => {
    const brandKey = normalizeBrandKey(entry.name);
    try {
      // "new arrivals" biases Google Shopping toward currently listed stock;
      // the brand name keyword plus result-level brand data does the rest.
      const q = `${entry.name} women's clothing new arrivals`;
      const endpoint = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(
        q,
      )}&num=30&api_key=${serpKey}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        console.error('feed-scrape: SerpAPI HTTP', res.status, 'for', brandKey);
        failedBrands++;
        return;
      }
      const data = await res.json();
      const raw: any[] = Array.isArray(data?.shopping_results) ? data.shopping_results : [];

      const rows: ScrapedRow[] = raw
        .map((r): ScrapedRow | null => {
          const productUrl =
            (typeof r?.product_link === 'string' && r.product_link) ||
            (typeof r?.link === 'string' && r.link) ||
            null;
          const imageUrl = typeof r?.thumbnail === 'string' ? r.thumbnail : null;
          if (!productUrl || !imageUrl) return null;
          return {
            brand: entry.name,
            brand_key: brandKey,
            name: typeof r?.title === 'string' ? r.title : null,
            price: typeof r?.extracted_price === 'number' ? r.extracted_price : null,
            image_url: imageUrl,
            product_url: productUrl,
            category: null,
            style_tags: entry.styles,
            budget_tier: entry.tier,
            scraped_at: startedAt,
          };
        })
        .filter((row): row is ScrapedRow => row !== null)
        .slice(0, PER_BRAND);

      if (rows.length === 0) {
        // No usable results is a soft failure: keep last month's rows.
        console.error('feed-scrape: no usable results for', brandKey);
        failedBrands++;
        return;
      }

      const { error: upsertErr } = await admin
        .from('feed_scraped_products')
        .upsert(rows, { onConflict: 'product_url' });
      if (upsertErr) {
        console.error('feed-scrape: upsert failed for', brandKey, upsertErr);
        failedBrands++;
        return;
      }

      // Only after a successful refresh: age out this brand's dead listings.
      await admin
        .from('feed_scraped_products')
        .delete()
        .eq('brand_key', brandKey)
        .lt('scraped_at', staleCutoff);

      okBrands++;
      totalRows += rows.length;
    } catch (e) {
      console.error('feed-scrape: brand failed', brandKey, e);
      failedBrands++;
    }
  };

  // Simple worker pool over the catalog.
  const queue = [...brands];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await scrapeBrand(next);
    }
  });
  await Promise.all(workers);

  console.log(
    `feed-scrape: done — ${okBrands} brands ok, ${failedBrands} failed, ${totalRows} rows upserted`,
  );
  return json({ ok: true, brands: okBrands, failed: failedBrands, rows: totalRows }, 200);
});

// Constant-time string comparison — a naive `===` short-circuits on the first
// mismatched byte, letting a timing attack narrow down a secret one
// character at a time. Always walks the full (padded) length instead.
function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b) return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Keep in sync with normalizeBrand in src/lib/brands.ts (see note there).
function normalizeBrandKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
