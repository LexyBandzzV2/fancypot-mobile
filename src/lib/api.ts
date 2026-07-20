import { supabase } from './supabase';
import { normalizeBrand } from './brands';

/**
 * All AI features are invoked through Supabase Edge Functions. The mobile app
 * never talks to an AI provider directly and never holds a provider key. Each
 * function enforces auth + tier + usage limits + rate limits server-side before
 * doing any work (see supabase/functions/_shared/ai-router.ts::chargeAiSpend).
 */

export interface WardrobeItem {
  id: string;
  user_id: string;
  image_url: string | null;
  category: string | null;
  name: string | null;
  /** Style Me v2 tags (see OCCASIONS/VIBES in brands.ts). Additive text[]
   * columns, default '{}'. Drive tag-aware selection in the stylist. */
  occasions: string[] | null;
  vibes: string[] | null;
  processing_status: string | null;
  processing_error: string | null;
  created_at: string;
}

export interface Outfit {
  id: string;
  user_id: string;
  name: string | null;
  category: string | null;
  image_url: string | null;
  item_ids: string[] | null;
  /** Legacy single occasion — kept for older saved looks. New saves also write
   * the `occasions`/`vibes` text[] arrays below (Style Me v2). */
  occasion: string | null;
  occasions: string[] | null;
  vibes: string[] | null;
  /**
   * Shoppable origin (the product page a Get-the-Look match came from). The
   * app uses `source_url`; it is persisted to / read from the `product_url`
   * column on public.outfits (see saveOutfit/listOutfits) — that is the column
   * the deployed backend added. Null for AI-composed stylist outfits.
   */
  source_url: string | null;
  created_at: string;
}

export interface FeedProduct {
  id: string;
  brand: string | null;
  name: string | null;
  /** Scraped display string ("€2,310.00", "$59.99") or a bare number. */
  price: string | number | null;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  style_tags: string[] | null;
  budget_tier: string | null;
}

/** Thrown when an edge function reports the user is over-limit / rate-limited. */
export class UsageLimitError extends Error {
  constructor(
    message: string,
    public readonly code: 'over_limit' | 'rate_limited' | 'blocked' | 'unknown',
  ) {
    super(message);
    this.name = 'UsageLimitError';
  }
}

async function invokeAI<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, { body });
  if (error) {
    // FunctionsHttpError exposes the response for structured limit errors.
    const res: Response | undefined = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      let payload: { error?: unknown; code?: unknown } | null = null;
      try {
        payload = await res.json();
      } catch {
        // Non-JSON body — fall through to the raw error below.
      }
      const message = typeof payload?.error === 'string' ? payload.error : null;
      if (res.status === 429) {
        throw new UsageLimitError(message ?? 'Rate limited', 'rate_limited');
      }
      if (res.status === 402 || res.status === 403) {
        throw new UsageLimitError(
          message ?? 'You have reached your plan limit.',
          payload?.code === 'ai_blocked' ? 'blocked' : 'over_limit',
        );
      }
      // Any OTHER status (400 validation, 500 crash…) is NOT a plan limit —
      // wrapping it as UsageLimitError made every backend error surface as
      // "Plan limit reached" with an Upgrade button, hiding the real problem.
      if (message) throw new Error(message);
    }
    throw error;
  }
  return data as T;
}

// ---- Wardrobe ----
export async function listWardrobe(userId: string): Promise<WardrobeItem[]> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WardrobeItem[];
}

export async function insertWardrobeItem(
  userId: string,
  imagePath: string,
): Promise<WardrobeItem> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    // `category` is NOT NULL in the DB but is only known after the async
    // classifier (wardrobe-process) runs, so seed a placeholder to satisfy the
    // constraint at insert time — the classifier overwrites it moments later.
    // Without this, every upload fails with a not-null violation on category.
    .insert({
      user_id: userId,
      image_url: imagePath,
      category: 'Uncategorized',
      processing_status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as WardrobeItem;
}

export async function deleteWardrobeItem(id: string): Promise<void> {
  const { error } = await supabase.from('wardrobe_items').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Kick the async classify + background-removal edge function. The deployed
 * function is metered via chargeAiSpend, so it can REFUSE with 402/429 when
 * the account is over its AI budget — surface that as UsageLimitError instead
 * of letting the item sit at "Styling…" forever with no explanation.
 */
export async function processWardrobeItem(itemId: string): Promise<void> {
  await invokeAI<unknown>('wardrobe-process', { itemId });
}

/**
 * Category options for closet pieces. Mirrors the classifier's vocabulary so a
 * manual pick and an AI pick land in the same buckets; 'Uncategorized' is the
 * insert-time placeholder (see insertWardrobeItem).
 */
export const WARDROBE_CATEGORIES = [
  'Tops',
  'Bottoms',
  'Dresses',
  'Outerwear',
  'Shoes',
  'Bags',
  'Accessories',
  'Other',
];

/** User-editable fields on a closet piece: name it, re-bucket its category, and
 * tag it with occasions/vibes (Style Me v2) for tag-aware stylist selection. */
export async function updateWardrobeItem(
  id: string,
  fields: {
    name?: string | null;
    category?: string | null;
    occasions?: string[];
    vibes?: string[];
  },
): Promise<void> {
  const { error } = await supabase.from('wardrobe_items').update(fields).eq('id', id);
  if (error) throw error;
}

// ---- Outfits / library ----
// The app-facing field is `source_url`, but the deployed `outfits` table stores
// the buy link in the `product_url` column. Bridge the two at the DB boundary
// so screens keep using `source_url` (Outfit interface) while persistence lands
// in the real column.
//
// The live table carries BOTH columns: divergent builds briefly wrote the link
// straight to a `source_url` column, so reads take whichever is set (and
// writes fill both) — otherwise looks saved by those builds lose their
// "Get the look" button even though the link is right there in the row.
function rowToOutfit(row: Record<string, any>): Outfit {
  const { product_url, source_url, ...rest } = row;
  return { ...rest, source_url: product_url ?? source_url ?? null } as Outfit;
}

export async function listOutfits(userId: string): Promise<Outfit[]> {
  const { data, error } = await supabase
    .from('outfits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToOutfit);
}

export async function saveOutfit(
  userId: string,
  outfit: Partial<Outfit>,
): Promise<Outfit> {
  const { source_url, ...rest } = outfit;
  const { data, error } = await supabase
    .from('outfits')
    .insert({
      user_id: userId,
      ...rest,
      // Write both columns (see rowToOutfit) so every reader finds the link.
      ...(source_url !== undefined ? { product_url: source_url, source_url } : {}),
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToOutfit(data);
}

export async function deleteOutfit(id: string): Promise<void> {
  const { error } = await supabase.from('outfits').delete().eq('id', id);
  if (error) throw error;
}

// ---- Feed ----
/**
 * The feed-page function has returned both a bare array and a wrapped
 * `{ products: [...] }` shape across versions; spreading a non-array crashes
 * the feed screen ("iterator method is not callable" on Hermes), so coerce
 * here and never let a payload-shape drift reach the UI.
 */
function coerceProducts(data: unknown): FeedProduct[] {
  if (Array.isArray(data)) return data as FeedProduct[];
  const products = (data as { products?: unknown } | null)?.products;
  return Array.isArray(products) ? (products as FeedProduct[]) : [];
}

export async function getFeed(): Promise<FeedProduct[]> {
  // The deployed feed-page accepts a body `limit`; ask for a fuller first page
  // (24) so the feed has depth. coerceProducts tolerates array vs `{products}`.
  return coerceProducts(await invokeAI<unknown>('feed-page', { limit: 24 }));
}

/**
 * NON-AI SerpAPI fresh-products source (supabase/functions/feed-fresh). Live
 * Google Shopping results for the user's favorite stores — no AI credits
 * spent. Ids are prefixed 'fresh-' and are synthetic (no backing products
 * row), so never write reactions against them.
 */
export async function getFreshFeed(store?: string): Promise<FeedProduct[]> {
  const res = await invokeAI<unknown>('feed-fresh', store ? { store } : {});
  return coerceProducts(res);
}

// The scraper caps every brand at PER_BRAND rows per run (see
// supabase/functions/feed-scrape/index.ts), so the whole catalog tops out
// around brand-count * PER_BRAND — comfortably under this ceiling even at full
// catalog size. It exists only as a defensive backstop against an unbounded
// table, never as an active limiter: every row in a run shares one
// `scraped_at` timestamp (stamped once per run, not per brand), so ordering
// by it can't break ties meaningfully — a low cap here would silently drop
// whichever brands Postgres happens to return last, with no relation to
// data quality. Kept well above catalog-size * PER_BRAND (~140 * 100 = 14,000).
const SCRAPED_FEED_CEILING = 20000;

// PostgREST silently caps every request at ~1,000 rows no matter what
// .limit() asks for, so the catalog MUST be paged — a single big-limit query
// "works" until the table outgrows one page, then arbitrary brands vanish
// from the feed (rows past the cap are dropped among tied scraped_at values).
const SCRAPED_PAGE = 1000;

/**
 * Monthly-scraped products (supabase/functions/feed-scrape → the
 * feed_scraped_products table, read directly with the user's own RLS-scoped
 * client). Real currently-listed items with live buy links, refreshed on the
 * 1st of each month. Pass the user's saved stores to scope server-side; no
 * stores → the whole catalog.
 */
export async function getScrapedFeed(stores?: string[]): Promise<FeedProduct[]> {
  const keys = (stores ?? []).map(normalizeBrand).filter(Boolean);
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page * SCRAPED_PAGE < SCRAPED_FEED_CEILING; page++) {
    let query = supabase
      .from('feed_scraped_products')
      .select('id, brand, name, price, image_url, product_url, category, style_tags, budget_tier')
      // The id tiebreak makes the order total: scraped_at is stamped once per
      // run, so ordering by it alone would let tied rows swap between pages
      // (duplicating some rows and dropping others).
      .order('scraped_at', { ascending: false })
      .order('id', { ascending: true })
      .range(page * SCRAPED_PAGE, (page + 1) * SCRAPED_PAGE - 1);
    if (keys.length > 0) query = query.in('brand_key', keys);
    const { data, error } = await query;
    if (error) {
      // Keep whatever full pages already arrived — a partial catalog beats
      // blanking the feed over a mid-pagination hiccup.
      if (rows.length > 0) break;
      throw error;
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < SCRAPED_PAGE) break; // last page
  }
  // 'scraped-' prefix marks these ids as synthetic (no products row), same
  // contract as 'fresh-' — reactions must never be written against them.
  return rows.map((r) => ({ ...r, id: `scraped-${r.id}` })) as FeedProduct[];
}

/**
 * Fresh-feed ('fresh-') and scraped-feed ('scraped-') items are synthetic —
 * no products row backs them, so reactions can't be persisted for them. UI
 * should hide persistent affordances (like/save) for these; reactToProduct
 * also refuses them as a backstop.
 */
export function isSyntheticProduct(productId: string): boolean {
  return productId.startsWith('fresh-') || productId.startsWith('scraped-');
}

export async function reactToProduct(
  productId: string,
  reaction: 'like' | 'dislike' | 'save',
): Promise<void> {
  // Synthetic fresh-feed items have no backing products row; writing a
  // reaction for one would violate the FK, so no-op instead.
  if (isSyntheticProduct(productId)) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('product_reactions')
    .upsert(
      { user_id: user.id, product_id: productId, reaction },
      { onConflict: 'user_id,product_id,reaction' },
    );
  if (error) throw error;
}

// ---- AI features ----
export interface AnalyzedPiece {
  id: string;
  name: string;
  category: string;
  image_url: string;
}

export async function analyzeOutfit(imageBase64: string): Promise<AnalyzedPiece[]> {
  const res = await invokeAI<{ pieces: AnalyzedPiece[] }>('analyze-outfit', {
    image: imageBase64,
  });
  return res.pieces ?? [];
}

// ---- Get the Look (non-AI reverse image search) ----
export interface LookMatch {
  title: string | null;
  link: string | null;
  source: string | null;
  thumbnail: string | null;
  price: number | null;
}

/**
 * NON-AI reverse image search (SerpAPI Google Lens). Takes a signed URL to the
 * user's uploaded photo and returns shoppable look-alikes. Uses invokeAI purely
 * for its structured 429/limit error handling — no AI credits are spent.
 */
export async function getTheLookSearch(imageUrl: string): Promise<LookMatch[]> {
  const res = await invokeAI<{ results: LookMatch[] }>('get-the-look-search', {
    imageUrl,
  });
  return res.results ?? [];
}

export async function generateOutfit(params: {
  itemIds: string[];
  /** Storage paths / URLs of the same pieces. The deployed function resolves
   * image refs (the web app sends these); itemIds alone read as "no items". */
  items?: string[];
  occasion?: string;
  vibe?: string;
}): Promise<{ image_url: string }> {
  return invokeAI<{ image_url: string }>('generate-outfit', params);
}

export async function tryOn(params: {
  personImage: string;
  outfitImage: string;
}): Promise<{ image_url: string }> {
  return invokeAI<{ image_url: string }>('try-on', params);
}

/**
 * A single "complete the look" gap pick from recommend-pieces. These are real
 * missing-piece suggestions with a real store link — they carry NO image (the
 * card renders text + a Shop button). `gap` is the wardrobe gap it fills (e.g.
 * "Shoes"), `reason` is the one-line why, `searchQuery`/`url` are the shop link,
 * and `sourcedLive`/`liveTitle` mark picks resolved against a live listing.
 */
export interface PiecePick {
  name: string;
  category: string;
  gap: string;
  store: string;
  reason: string;
  searchQuery: string;
  url: string;
  liveTitle?: string;
  sourcedLive?: boolean;
}

export async function recommendPieces(params: {
  outfitImage: string;
  occasion?: string;
  stores?: string[];
  styles?: string[];
  budget?: string;
}): Promise<PiecePick[]> {
  const res = await invokeAI<{ picks: PiecePick[] }>('recommend-pieces', params);
  return res.picks ?? [];
}
