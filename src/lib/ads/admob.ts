// Native AdMob surface. Metro resolves this on iOS/Android and TypeScript uses
// it for types. The web build uses admob.web.ts instead (Metro prefers the
// `.web` extension), so `react-native-google-mobile-ads` — which has no web
// support — is never bundled for the in-browser preview.
import mobileAds, {
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';

export {
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
  MaxAdContentRating,
};
export default mobileAds;
