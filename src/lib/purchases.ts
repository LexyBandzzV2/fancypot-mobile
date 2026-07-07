// Default (native) RevenueCat SDK. Metro resolves this on iOS/Android and
// TypeScript uses it for types. The web build uses purchases.web.ts instead,
// which Metro prefers via the `.web` extension.
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

export default Purchases;
export { LOG_LEVEL };
