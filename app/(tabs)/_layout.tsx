import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { fonts } from '@/theme';
import { Glass } from '@/components/Glass';
import { useTheme } from '@/providers/ThemeProvider';

/** Floating glass tab bar height (excludes safe-area bottom inset, which
 * react-navigation adds on top of this on iOS). Also used to pad scene
 * content so it doesn't sit underneath the now-absolutely-positioned bar. */
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 64;

/**
 * Bottom tab bar — the primary mobile navigation pattern (replaces the web's
 * top nav + sidebar drawer). Five thumb-reachable destinations.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync().catch(() => {});
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: TAB_BAR_HEIGHT,
          paddingTop: 6,
        },
        tabBarBackground: () => <Glass style={{ flex: 1 }} intensity={40} />,
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
        // Keep scrollable screen content from being hidden under the floating bar.
        sceneStyle: { paddingBottom: TAB_BAR_HEIGHT },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Closet',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shirt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Style',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size + 12} color={colors.pinkWarm} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
