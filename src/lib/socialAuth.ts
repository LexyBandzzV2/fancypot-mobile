import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

/**
 * Sign in with Apple, routed through Supabase Auth (not a separate identity
 * provider) so an account created on the app lands in the exact same
 * auth.users row a web sign-in would — one shared backend, one account.
 *
 * Apple is the only third-party sign-in the app offers; everyone else uses
 * email + password.
 */

/** Apple only ships Sign in with Apple on Apple hardware/OS — guard before rendering the button. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Native "Sign in with Apple" sheet -> hand the identity token to Supabase. */
export async function signInWithApple(): Promise<{ userId: string } | null> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    // User dismissed the native sheet — not an error worth surfacing.
    if (e?.code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token. Try again.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  return data.user ? { userId: data.user.id } : null;
}
