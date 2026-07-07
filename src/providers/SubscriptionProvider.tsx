import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  LOG_LEVEL,
} from 'react-native-purchases';
import { config } from '@/lib/config';
import { tierForPlan, type Tier, type EntitlementId } from '@/lib/plans';
import { useAuth } from './AuthProvider';

interface SubscriptionContextValue {
  /**
   * The tier used for GATING. Derived from the backend `profiles.plan`, which the
   * RevenueCat webhook keeps authoritative. Never trust the raw client for access.
   */
  tier: Tier;
  /** Raw entitlement RevenueCat reports on-device (for fast UI only). */
  clientEntitlement: EntitlementId;
  offering: PurchasesOffering | null;
  ready: boolean;
  /** Purchase a package by RevenueCat package identifier. */
  purchase: (rcPackageId: string) => Promise<void>;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

function entitlementFromCustomerInfo(info: CustomerInfo | null): EntitlementId {
  const active = info?.entitlements.active ?? {};
  if (active['business']) return 'business';
  if (active['pro']) return 'pro';
  return 'free';
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, refreshProfile } = useAuth();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [clientEntitlement, setClientEntitlement] = useState<EntitlementId>('free');
  const [ready, setReady] = useState(false);

  const apiKey =
    Platform.OS === 'ios' ? config.revenueCatIosKey : config.revenueCatAndroidKey;

  // Configure the SDK once.
  useEffect(() => {
    if (!apiKey) {
      // No IAP key configured (e.g. local dev). Degrade gracefully: gating still
      // works via the backend plan; the paywall shows a "not available" state.
      setReady(true);
      return;
    }
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
    setReady(true);
  }, [apiKey]);

  // Identify the RevenueCat user with the Supabase user id so server-side
  // webhooks can map purchases back to the right account.
  useEffect(() => {
    if (!apiKey || !ready) return;
    (async () => {
      try {
        if (user?.id) {
          await Purchases.logIn(user.id);
        } else {
          await Purchases.logOut().catch(() => {});
        }
        const info = await Purchases.getCustomerInfo();
        setClientEntitlement(entitlementFromCustomerInfo(info));
        const offerings = await Purchases.getOfferings();
        setOffering(offerings.current ?? null);
      } catch {
        // Non-fatal — backend plan remains the source of truth.
      }
    })();
  }, [user?.id, apiKey, ready]);

  // Keep client entitlement fresh when RevenueCat pushes updates.
  useEffect(() => {
    if (!apiKey) return;
    const listener = (info: CustomerInfo) => {
      setClientEntitlement(entitlementFromCustomerInfo(info));
      // A purchase/renewal landed — pull the backend plan the webhook just wrote.
      refreshProfile().catch(() => {});
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [apiKey, refreshProfile]);

  const purchase = useCallback(
    async (rcPackageId: string) => {
      if (!apiKey) throw new Error('In-app purchases are not configured in this build.');
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (p) => p.identifier === rcPackageId,
      );
      if (!pkg) throw new Error('That plan is not available right now.');
      await Purchases.purchasePackage(pkg);
      // Give the webhook a moment, then reconcile with the backend.
      await refreshProfile();
    },
    [apiKey, refreshProfile],
  );

  const restore = useCallback(async () => {
    if (!apiKey) return;
    const info = await Purchases.restorePurchases();
    setClientEntitlement(entitlementFromCustomerInfo(info));
    await refreshProfile();
  }, [apiKey, refreshProfile]);

  const refresh = useCallback(async () => {
    if (apiKey) {
      const info = await Purchases.getCustomerInfo();
      setClientEntitlement(entitlementFromCustomerInfo(info));
    }
    await refreshProfile();
  }, [apiKey, refreshProfile]);

  // GATING tier = backend plan (authoritative), not the raw client entitlement.
  const tier = useMemo(() => tierForPlan(profile?.plan), [profile?.plan]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({ tier, clientEntitlement, offering, ready, purchase, restore, refresh }),
    [tier, clientEntitlement, offering, ready, purchase, restore, refresh],
  );

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within a SubscriptionProvider');
  return ctx;
}
