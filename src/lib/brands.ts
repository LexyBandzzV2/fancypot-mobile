/**
 * Single source of truth for style/store/budget preference options.
 * This list is shared by the preferences editor, feed brand chips, and the feed-fresh
 * edge function queries; brand strings are stored verbatim in profiles.preferences.stores,
 * so never rename existing entries.
 */

export const STYLES = [
  'Classic',
  'Minimal',
  'Trendy',
  'Streetwear',
  'Romantic',
  'Edgy',
  'Preppy',
  'Boho',
];

export const STORES = [
  'Abercrombie & Fitch',
  'Adidas',
  'Aerie',
  'American Eagle',
  'Anthropologie',
  'ASOS',
  'Aritzia',
  'Banana Republic',
  'Bershka',
  'Boohoo',
  'Brandy Melville',
  'COS',
  'Dynamite',
  'Edikted',
  'Everlane',
  'Fashion Nova',
  'Forever 21',
  'Free People',
  'Gap',
  'Garage',
  'Gymshark',
  'H&M',
  'Hollister',
  'J.Crew',
  "Levi's",
  'Lululemon',
  'Madewell',
  'Mango',
  'Massimo Dutti',
  'New Balance',
  'Nike',
  'Nordstrom',
  'Old Navy',
  'Oh Polly',
  'Pacsun',
  'PrettyLittleThing',
  'Princess Polly',
  'Pull&Bear',
  'Reformation',
  'Revolve',
  'Shein',
  'Skims',
  'SSENSE',
  'Stradivarius',
  'Target',
  'Uniqlo',
  'Urban Outfitters',
  'White Fox',
  'Zara',
];

export const BUDGETS = ['Budget', 'Mid-range', 'Premium', 'Luxury'];

/**
 * Normalize a brand name for comparison: lowercase, strip non-alphanumeric chars.
 * E.g., 'H&M' -> 'hm', "Levi's" -> 'levis', 'Pull&Bear' -> 'pullbear'
 *
 * Keep in sync with normalizeBrandKey in supabase/functions/feed-fresh/index.ts
 * (Deno can't import this module; the edge function uses the same normalization
 * for its cache keys, and a divergence would break cache hits).
 */
export function normalizeBrand(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Check if two brand strings match, accounting for common variations.
 * Returns false if either normalizes to empty; true if the normalized forms are
 * equal or one is a PREFIX of the other ('H & M Official' ~= 'H&M', 'Zara US'
 * ~= 'Zara'). Deliberately NOT a contains-check: short store names normalize to
 * tiny tokens ('COS' -> 'cos', 'H&M' -> 'hm') that appear inside unrelated
 * brands ('Lacoste', 'Costco', 'Bohme'), and contains-matching would surface
 * those under the wrong filter chip.
 */
export function brandsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const normA = normalizeBrand(a);
  const normB = normalizeBrand(b);

  if (!normA || !normB) return false;
  return normA.startsWith(normB) || normB.startsWith(normA);
}
