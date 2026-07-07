import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { StackHeader } from '@/components';
import { colors, fillObject } from '@/theme';

/**
 * Renders the hosted legal pages (single source of truth on fancypot.org) so
 * mobile and web never drift. Routes: /legal/privacy, /legal/terms.
 */
const URLS: Record<string, { title: string; url: string }> = {
  privacy: { title: 'Privacy Policy', url: 'https://fancypot.org/privacy' },
  terms: { title: 'Terms of Use', url: 'https://fancypot.org/terms' },
  support: { title: 'Support', url: 'https://fancypot.org/support' },
};

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const entry = URLS[doc ?? 'privacy'] ?? URLS.privacy;

  return (
    <View style={styles.root}>
      <StackHeader title={entry.title} />
      <WebView
        source={{ uri: entry.url }}
        style={styles.web}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.blushDeep} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  web: { flex: 1, backgroundColor: colors.cream },
  loading: { ...fillObject, alignItems: 'center', justifyContent: 'center' },
});
