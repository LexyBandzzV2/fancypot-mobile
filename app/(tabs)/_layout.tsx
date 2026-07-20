import React from 'react';
import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/FloatingTabBar';
import { useTheme } from '@/providers/ThemeProvider';

/**
 * Bottom tab bar — the primary mobile navigation. The five destinations
 * (Closet / Feed / Style / Saved / Profile) render through a custom
 * FloatingTabBar: a floating frosted-glass pill with the central Style action
 * raised into an illuminated pink circle. Route names and order are unchanged,
 * so every deep link and drawer target still resolves.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => (
        <FloatingTabBar state={props.state} navigation={props.navigation} />
      )}
      screenOptions={{
        headerShown: false,
        // Keep scrollable screen content clear of the floating bar. Tab screens
        // also reserve ~120 in their own content padding; this is the backstop
        // for any that don't.
        //
        // backgroundColor: the tab scene container defaults to React
        // Navigation's light theme background, which showed as a white strip
        // along the bottom (behind the floating bar) in dark mode. Paint it
        // with the themed app background so it matches in both light and dark.
        sceneStyle: { paddingBottom: 96, backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Closet' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="create" options={{ title: 'Style' }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
