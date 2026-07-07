// Web stub for RevenueCat. `react-native-purchases` is native-only, so on web
// (used only for the in-browser preview) we provide no-op methods. Real IAP is
// only available in the iOS/Android builds. The app already treats the backend
// `profiles.plan` as the source of truth, so gating still behaves correctly.

export const LOG_LEVEL = { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' } as any;

const emptyCustomerInfo = { entitlements: { active: {} } };

const Purchases: any = {
  setLogLevel() {},
  configure() {},
  async logIn() {
    return { customerInfo: emptyCustomerInfo, created: false };
  },
  async logOut() {
    return emptyCustomerInfo;
  },
  async getCustomerInfo() {
    return emptyCustomerInfo;
  },
  async getOfferings() {
    return { current: null, all: {} };
  },
  addCustomerInfoUpdateListener() {},
  removeCustomerInfoUpdateListener() {},
  async purchasePackage() {
    throw new Error('In-app purchases are only available in the iOS/Android app.');
  },
  async restorePurchases() {
    return emptyCustomerInfo;
  },
};

export default Purchases;
