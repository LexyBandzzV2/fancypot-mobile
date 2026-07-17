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
  '& Other Stories',
  'Abercrombie & Fitch',
  'Acne Studios',
  'Adidas',
  'Aerie',
  'Alexander McQueen',
  'AllSaints',
  'Alo Yoga',
  'American Eagle',
  'Ann Taylor',
  'Anthropologie',
  'Anti Social Social Club',
  'ASOS',
  'Aritzia',
  'Balenciaga',
  'Balmain',
  'Banana Republic',
  'BAPE',
  'Beginning Boutique',
  'Bershka',
  'BlackCraft Cult',
  'Boohoo',
  'Bottega Veneta',
  'Brandy Melville',
  'Canada Goose',
  'Carhartt WIP',
  'Celine',
  'Chanel',
  "Chico's",
  'Cider',
  'Club Monaco',
  'Columbia',
  'COS',
  'Dior',
  'Disturbia',
  'Dolls Kill',
  'Dynamite',
  'Edikted',
  'Essentials',
  'Everlane',
  'Fabletics',
  'Fashion Nova',
  'Fear of God',
  'Fendi',
  'Forever 21',
  'Free Label',
  'Free People',
  'Free People Movement',
  'Gap',
  'Garage',
  'Givenchy',
  'Gucci',
  'Gymshark',
  'H&M',
  'Hollister',
  'Hot Topic',
  'House of CB',
  'I.AM.GIA',
  'J.Crew',
  'J.Jill',
  'Jacquemus',
  'Jaded London',
  'Kate Spade',
  'Killstar',
  'Kith',
  "Levi's",
  'Loewe',
  'LOFT',
  'Louis Vuitton',
  'Lululemon',
  'Mackage',
  'Madewell',
  'Maison Margiela',
  'Maje',
  'Mango',
  'Massimo Dutti',
  'Meshki',
  'Missguided',
  'Miu Miu',
  'Moncler',
  'Moose Knuckles',
  'Motel Rocks',
  'Nasty Gal',
  'New Balance',
  'Nike',
  'Nordstrom',
  'Off-White',
  'Old Navy',
  'Oh Polly',
  'Outdoor Voices',
  'Pacsun',
  'Palace',
  'Patagonia',
  'Prada',
  'Pretty Lavish',
  'PrettyLittleThing',
  'Princess Polly',
  'Pucci',
  'Pull&Bear',
  'Punk Rave',
  'Rag & Bone',
  'RebelsMarket',
  'Reformation',
  'Reiss',
  'Revolve',
  'Rick Owens',
  'Roberto Cavalli',
  'Saint Laurent',
  'Sandro',
  'Set Active',
  'Shein',
  'Skims',
  'Sourpuss Clothing',
  'SSENSE',
  'Stradivarius',
  'Stüssy',
  'Supreme',
  'Talbots',
  'Target',
  'Ted Baker',
  'The Hundreds',
  'The North Face',
  'The Ragged Priest',
  'Theory',
  'Tiger Mist',
  'Tom Ford',
  'Tory Burch',
  'Tripp NYC',
  'Unif',
  'Uniqlo',
  'Urban Outfitters',
  'Valentino',
  'Versace',
  'Vince',
  'Vivienne Westwood',
  'Vuori',
  'White Fox',
  'White House Black Market',
  'YesStyle',
  'Zara',
];

export const BUDGETS = ['Budget', 'Mid-range', 'Premium', 'Luxury'];

/**
 * Whether an item in `itemTier` should appear for a user whose budget
 * preference is `userBudget`. Cheaper-or-equal tiers pass (a Premium shopper
 * still sees Mid-range pieces); pricier tiers are hidden. Unknown/missing
 * values on either side always pass — filtering must never blank the feed
 * over absent metadata.
 */
export function budgetAllows(
  userBudget: string | null | undefined,
  itemTier: string | null | undefined,
): boolean {
  if (!userBudget || !itemTier) return true;
  const userIdx = BUDGETS.indexOf(userBudget);
  const itemIdx = BUDGETS.indexOf(itemTier);
  if (userIdx === -1 || itemIdx === -1) return true;
  return itemIdx <= userIdx;
}

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
