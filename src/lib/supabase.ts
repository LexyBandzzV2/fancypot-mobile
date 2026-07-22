import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { config } from './config';

/**
 * Supabase Auth persists the session as JSON. SecureStore has a ~2KB per-value
 * limit, so we shard large values across multiple keys. In practice the session
 * fits comfortably, but sharding keeps us safe if custom claims grow.
 */
const NativeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};

// expo-secure-store is native-only and throws on web. For the in-browser
// preview, fall back to localStorage (native builds always use SecureStore).
const WebStore = {
  async getItem(key: string): Promise<string | null> {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

const authStorage = Platform.OS === 'web' ? WebStore : NativeSecureStore;

/**
 * Single shared client, pointed at the SAME Supabase project as the web app.
 * A user who signs up on the website and one who signs up in the app land in
 * the same auth.users / profiles rows — one account across all platforms.
 */
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no URL-based session on native
    // PKCE is the required OAuth flow for native apps. Redirects carry only a
    // one-time `?code=`, useless without the verifier held on this device — so
    // nothing sensitive rides on the `fancypot://` scheme, which any malicious
    // co-installed app could also register. It is also what makes
    // exchangeCodeForSession work in socialAuth / useAuthDeepLinks: without a
    // verifier there is no code to exchange, and the only remaining path would
    // be the implicit flow, which returns raw tokens in the URL fragment.
    flowType: 'pkce',
    lock: processLock,
  },
});

// Refresh tokens only while the app is foregrounded (Supabase RN guidance).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
