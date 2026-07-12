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
 */
export function normalizeBrand(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Check if two brand strings match, accounting for common variations.
 * Returns false if either normalizes to empty; true if normalized forms are equal
 * or one contains the other (e.g., 'H & M Official' ~= 'H&M').
 */
export function brandsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const normA = normalizeBrand(a);
  const normB = normalizeBrand(b);

  if (!normA || !normB) return false;
  if (normA === normB) return true;
  return normA.includes(normB) || normB.includes(normA);
}
