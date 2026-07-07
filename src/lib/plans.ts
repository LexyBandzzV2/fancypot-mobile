/**
 * Subscription tiers.
 *
 * The mobile app markets three tiers — Free / Pro / Business — matching the
 * RevenueCat entitlement identifiers. The existing backend (Stripe + the
 * `profiles.plan` column) uses the values free / pro / ultimate. "Business" is
 * the mobile-facing name for the same top tier the web calls "Ultimate", so we
 * map between them here rather than migrating the live database.
 *
 * Limits below are the REAL numbers already enforced in Postgres
 * (outfit_limit_for_plan, wardrobe_limit_for_plan, try_on_weekly_limit_for_plan).
 * They are shown to users but NEVER trusted for gating — the edge functions and
 * DB triggers are the source of truth.
 */
export type PlanValue = 'free' | 'pro' | 'ultimate';
export type EntitlementId = 'free' | 'pro' | 'business';

export interface Tier {
  entitlement: EntitlementId;
  plan: PlanValue;
  name: string;
  priceLabel: string;
  /** RevenueCat package identifier to purchase (configured in the RC dashboard). */
  rcPackageId: string | null;
  limits: {
    outfitsPerMonth: number;
    wardrobeItems: number;
    tryOnsPerWeek: number;
  };
  perks: string[];
}

export const TIERS: Record<EntitlementId, Tier> = {
  free: {
    entitlement: 'free',
    plan: 'free',
    name: 'Free',
    priceLabel: '$0',
    rcPackageId: null,
    limits: { outfitsPerMonth: 3, wardrobeItems: 20, tryOnsPerWeek: 2 },
    perks: [
      '3 AI outfits / month',
      'Up to 20 closet items',
      '2 virtual try-ons / week',
      'Style feed & saved looks',
    ],
  },
  pro: {
    entitlement: 'pro',
    plan: 'pro',
    name: 'Pro',
    priceLabel: '$6.99/mo',
    rcPackageId: '$rc_monthly', // maps to the Pro monthly package in RevenueCat
    limits: { outfitsPerMonth: 15, wardrobeItems: 60, tryOnsPerWeek: 6 },
    perks: [
      '15 AI outfits / month',
      'Up to 60 closet items',
      '6 virtual try-ons / week',
      'No ads',
      'Priority styling',
    ],
  },
  business: {
    entitlement: 'business',
    plan: 'ultimate',
    name: 'Business',
    priceLabel: '$14.99/mo',
    rcPackageId: '$rc_annual', // placeholder RC package id; set in RC dashboard
    limits: { outfitsPerMonth: 45, wardrobeItems: 180, tryOnsPerWeek: 18 },
    perks: [
      '45 AI outfits / month',
      'Up to 180 closet items',
      '18 virtual try-ons / week',
      'No ads',
      'Highest priority + early features',
    ],
  },
};

/** Map a backend plan value to the mobile entitlement/tier. */
export function tierForPlan(plan: PlanValue | string | null | undefined): Tier {
  switch (plan) {
    case 'pro':
      return TIERS.pro;
    case 'ultimate':
      return TIERS.business;
    default:
      return TIERS.free;
  }
}

/** Map a RevenueCat entitlement id to the backend plan value. */
export function planForEntitlement(entitlement: EntitlementId): PlanValue {
  return TIERS[entitlement].plan;
}

export const ORDERED_TIERS: Tier[] = [TIERS.free, TIERS.pro, TIERS.business];
