/**
 * Brand catalog for Style preferences — mirrors the backend scraper's
 * BRAND_CATALOG (supabase/functions/feed-scrape/catalog.ts in the web repo).
 * Names must match `feed_products.brand` EXACTLY: the feed's brand filter and
 * feed-page's `.in("brand", prefs.stores)` both compare against these strings.
 * If the backend catalog gains a brand, add it here too.
 */

export interface BrandGroup {
  title: string;
  brands: string[];
}

export const BRAND_GROUPS: BrandGroup[] = [
  {
    title: 'BUDGET-FRIENDLY',
    brands: [
      'H&M',
      'Shein',
      'Fashion Nova',
      'Forever 21',
      'Boohoo',
      'PrettyLittleThing',
      'Missguided',
      'Nasty Gal',
      'Old Navy',
      'Target',
      'Cider',
      'YesStyle',
      'Uniqlo',
      'Bershka',
      'Stradivarius',
      'Pull&Bear',
      'Edikted',
      'Hot Topic',
      'Garage',
    ],
  },
  {
    title: 'MID-RANGE',
    brands: [
      'Zara',
      'Mango',
      'Abercrombie & Fitch',
      'Aerie',
      'American Eagle',
      'Hollister',
      'Gap',
      'Banana Republic',
      'J.Crew',
      "Levi's",
      'Madewell',
      'Dynamite',
      'Brandy Melville',
      'PacSun',
      'Urban Outfitters',
      'Princess Polly',
      'White Fox',
      'Oh Polly',
      'Meshki',
      'Beginning Boutique',
      'Tiger Mist',
      'Motel Rocks',
      'I.AM.GIA',
      'Jaded London',
      'Pretty Lavish',
      'Dolls Kill',
      'Killstar',
      'Tripp NYC',
      'Disturbia',
      'BlackCraft Cult',
      'RebelsMarket',
      'The Ragged Priest',
      'Punk Rave',
      'Sourpuss Clothing',
      'Gymshark',
      'Nike',
      'Adidas',
      'New Balance',
      'Fabletics',
      'Outdoor Voices',
      'Set Active',
      'Columbia',
      'Ann Taylor',
      'LOFT',
      'J.Jill',
      'Talbots',
      "Chico's",
      'White House Black Market',
      'Carhartt WIP',
      'Stüssy',
      'The Hundreds',
      'Anti Social Social Club',
      'Unif',
      'Free Label',
      'ASOS',
      'Everlane',
      'COS',
      '& Other Stories',
      'Massimo Dutti',
    ],
  },
  {
    title: 'PREMIUM',
    brands: [
      'Aritzia',
      'Reformation',
      'Free People',
      'Free People Movement',
      'Anthropologie',
      'Revolve',
      'Nordstrom',
      'House of CB',
      'Skims',
      'Lululemon',
      'Alo Yoga',
      'Vuori',
      'Patagonia',
      'The North Face',
      'AllSaints',
      'Club Monaco',
      'Theory',
      'Vince',
      'Sandro',
      'Maje',
      'Rag & Bone',
      'Kate Spade',
      'Tory Burch',
      'Ted Baker',
      'Reiss',
      'Supreme',
      'Kith',
      'Palace',
      'BAPE',
      'Fear of God',
      'Essentials',
    ],
  },
  {
    title: 'LUXURY',
    brands: [
      'Chanel',
      'Dior',
      'Prada',
      'Gucci',
      'Louis Vuitton',
      'Saint Laurent',
      'Balenciaga',
      'Versace',
      'Fendi',
      'Givenchy',
      'Valentino',
      'Bottega Veneta',
      'Celine',
      'Roberto Cavalli',
      'Pucci',
      'Alexander McQueen',
      'Tom Ford',
      'Miu Miu',
      'Loewe',
      'Off-White',
      'Maison Margiela',
      'Vivienne Westwood',
      'Rick Owens',
      'Balmain',
      'Acne Studios',
      'Jacquemus',
      'SSENSE',
      'Moncler',
      'Canada Goose',
      'Mackage',
      'Moose Knuckles',
    ],
  },
];

// Budget tiers, cheapest → priciest. Used by budgetAllows for feed filtering;
// the preferences screen keeps its own copy for the chip UI.
const BUDGETS = ['Budget', 'Mid-range', 'Premium', 'Luxury'];

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
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
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
  b: string | null | undefined,
): boolean {
  const normA = normalizeBrand(a);
  const normB = normalizeBrand(b);
  if (!normA || !normB) return false;
  return normA.startsWith(normB) || normB.startsWith(normA);
}
