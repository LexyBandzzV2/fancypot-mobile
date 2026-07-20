import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import {
  PlayfairDisplay_500Medium,
  PlayfairDisplay_500Medium_Italic,
  PlayfairDisplay_600SemiBold,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { SubscriptionProvider } from '@/providers/SubscriptionProvider';
import { AdsProvider } from '@/providers/AdsProvider';
import { AIConsentProvider } from '@/providers/AIConsentProvider';
import { StylistJobProvider } from '@/providers/StylistJobProvider';
import { NavDrawerProvider } from '@/providers/NavDrawerProvider';
import { ThemeProvider, useTheme } from '@/providers/ThemeProvider';
import { useAuthDeepLinks } from '@/hooks/useAuthDeepLinks';
import { ErrorScreen } from '@/components';
import { initSentry } from '@/lib/sentry';

SplashScreen.preventAutoHideAsync().catch(() => {});
initSentry();

/** Root error boundary — expo-router renders this on any uncaught render error. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  Sentry.captureException(error);
  return <ErrorScreen error={error} retry={retry} />;
}

/**
 * Redirects between the (auth) and (tabs) groups based on session state.
 * Runs after the initial session check so we don't flash the wrong screen.
 */
function useProtectedRoute() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, initializing, segments, router]);
}

function RootNavigator() {
  const { initializing } = useAuth();
  const { colors } = useTheme();
  useProtectedRoute();
  useAuthDeepLinks();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync().catch(() => {});
  }, [initializing]);

  if (initializing) {
    // Keep the native splash up until we know where to send the user.
    return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="paywall"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="style/stylist" options={{ headerShown: false }} />
      <Stack.Screen name="style/get-the-look" options={{ headerShown: false }} />
      <Stack.Screen name="style/try-on" options={{ headerShown: false }} />
      <Stack.Screen name="style/outfit/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="verify-phone" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings/manage-subscription" />
      <Stack.Screen name="settings/preferences" />
      <Stack.Screen name="settings/account" />
      <Stack.Screen name="settings/change-email" />
      <Stack.Screen name="settings/delete-account" options={{ presentation: 'modal' }} />
      <Stack.Screen name="legal/[doc]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    GreatVibes_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_500Medium_Italic,
    PlayfairDisplay_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!fontsLoaded && !fontError) {
    return null; // native splash stays visible
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <SubscriptionProvider>
              <AdsProvider>
                <AIConsentProvider>
                  <StylistJobProvider>
                    <NavDrawerProvider>
                      <ThemedStatusBar />
                      <RootNavigator />
                    </NavDrawerProvider>
                  </StylistJobProvider>
                </AIConsentProvider>
              </AdsProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Status-bar icons flip to light glyphs in dark mode. */
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default Sentry.wrap(RootLayout);
