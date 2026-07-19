// Web stub for AdMob. `react-native-google-mobile-ads` is native-only, so on web
// (used only for the in-browser preview) every surface is a no-op. AdsProvider
// also guards on Platform, so these are never actually driven — they exist only
// so the module graph resolves without pulling in the native SDK on web.

export const AdEventType = {
  LOADED: 'loaded',
  ERROR: 'error',
  OPENED: 'opened',
  CLOSED: 'closed',
  CLICKED: 'clicked',
  PAID: 'paid',
} as const;

export const RewardedAdEventType = {
  LOADED: 'rewarded_loaded',
  EARNED_REWARD: 'rewarded_earned_reward',
} as const;

export const TestIds = {
  INTERSTITIAL: '',
  REWARDED: '',
  BANNER: '',
  APP_OPEN: '',
} as const;

export const MaxAdContentRating = { G: 'G', PG: 'PG', T: 'T', MA: 'MA' } as const;

const noopAd = {
  addAdEventListener: () => () => {},
  addEventListener: () => () => {},
  load: () => {},
  show: async () => {},
  loaded: false,
};

export const InterstitialAd = { createForAdRequest: () => noopAd } as any;
export const RewardedAd = { createForAdRequest: () => noopAd } as any;

const mobileAds = () => ({
  setRequestConfiguration: async () => {},
  initialize: async () => [] as unknown[],
});

export default mobileAds;
