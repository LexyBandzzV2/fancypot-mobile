import { supabase } from './supabase';

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
  occasion: string | null;
  created_at: string;
}

export interface FeedProduct {
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
      try {
        const payload = await res.json();
        if (res.status === 429) {
          throw new UsageLimitError(payload.error ?? 'Rate limited', 'rate_limited');
        }
        if (res.status === 402 || res.status === 403) {
          throw new UsageLimitError(
            payload.error ?? 'You have reached your plan limit.',
            payload.code === 'ai_blocked' ? 'blocked' : 'over_limit',
          );
        }
        if (payload?.error) throw new UsageLimitError(payload.error, 'unknown');
      } catch (e) {
        if (e instanceof UsageLimitError) throw e;
      }
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
    .insert({ user_id: userId, image_url: imagePath, processing_status: 'pending' })
    .select('*')
    .single();
  if (error) throw error;
  return data as WardrobeItem;
}

export async function deleteWardrobeItem(id: string): Promise<void> {
  const { error } = await supabase.from('wardrobe_items').delete().eq('id', id);
  if (error) throw error;
}

/** Kick the async classify + background-removal edge function. */
export async function processWardrobeItem(itemId: string): Promise<void> {
  await supabase.functions.invoke('wardrobe-process', { body: { itemId } });
}

// ---- Outfits / library ----
export async function listOutfits(userId: string): Promise<Outfit[]> {
  const { data, error } = await supabase
    .from('outfits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Outfit[];
}

export async function saveOutfit(
  userId: string,
  outfit: Partial<Outfit>,
): Promise<Outfit> {
  const { data, error } = await supabase
    .from('outfits')
    .insert({ user_id: userId, ...outfit })
    .select('*')
    .single();
  if (error) throw error;
  return data as Outfit;
}

export async function deleteOutfit(id: string): Promise<void> {
  const { error } = await supabase.from('outfits').delete().eq('id', id);
  if (error) throw error;
}

// ---- Feed ----
export async function getFeed(): Promise<FeedProduct[]> {
  return invokeAI<FeedProduct[]>('feed-page', {});
}

/**
 * NON-AI SerpAPI fresh-products source (supabase/functions/feed-fresh). Live
 * Google Shopping results for the user's favorite stores — no AI credits
 * spent. Ids are prefixed 'fresh-' and are synthetic (no backing products
 * row), so never write reactions against them.
 */
export async function getFreshFeed(store?: string): Promise<FeedProduct[]> {
  const res = await invokeAI<{ products: FeedProduct[]; reason?: 'no_stores' }>(
    'feed-fresh',
    store ? { store } : {},
  );
  return res?.products ?? [];
}

/**
 * Fresh-feed items are synthetic — the edge function mints their ids with a
 * 'fresh-' prefix and no products row backs them, so reactions can't be
 * persisted for them. UI should hide persistent affordances (like/save) for
 * these; reactToProduct also refuses them as a backstop.
 */
export function isSyntheticProduct(productId: string): boolean {
  return productId.startsWith('fresh-');
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

export async function recommendPieces(outfitImage: string): Promise<
  { name: string; store: string; url: string; image_url: string; price?: number }[]
> {
  const res = await invokeAI<{ recommendations: any[] }>('recommend-pieces', {
    image: outfitImage,
  });
  return res.recommendations ?? [];
}
