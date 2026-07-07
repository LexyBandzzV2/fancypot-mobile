import { Redirect } from 'expo-router';

/**
 * Entry point. The root layout's protected-route guard will bounce
 * unauthenticated users to /(auth)/welcome; authed users land in the tabs.
 */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
