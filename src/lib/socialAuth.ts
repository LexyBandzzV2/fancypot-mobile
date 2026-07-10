import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from './supabase';

/**
 * Social sign-in, both routed through Supabase Auth (not a separate identity
 * provider) so an account created on the app lands in the exact same
 * auth.users row a web sign-in would — one shared backend, one account.
 */

// Required so the OAuth browser session can resolve back into this module
// when the redirect fires (no-op on native until an auth session is pending).
WebBrowser.maybeCompleteAuthSession();

/** Apple only ships Sign in with Apple on Apple hardware/OS — guard before rendering the button. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Native "Sign in with Apple" sheet -> hand the identity token to Supabase.
 * Apple requires this (and not just Google) once any third-party login exists
 * on iOS — App Store guideline 4.8.
 */
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

const redirectTo = AuthSession.makeRedirectUri({ scheme: 'fancypot', path: 'auth-callback' });

/**
 * Browser-based Google OAuth via Supabase's hosted flow. We open Supabase's
 * authorize URL in an in-app browser and parse whatever comes back on the
 * `fancypot://auth-callback` redirect — either a PKCE `code` (exchanged for a
 * session) or, if the project is configured for the implicit flow, tokens in
 * the URL fragment.
 */
export async function signInWithGoogle(): Promise<{ userId: string } | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Could not start Google sign-in. Try again.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    // User closed the browser / cancelled — silent no-op.
    return null;
  }

  const url = new URL(result.url);

  // PKCE flow: ?code=...
  const code = url.searchParams.get('code');
  if (code) {
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return sessionData.user ? { userId: sessionData.user.id } : null;
  }

  // Implicit flow: tokens land in the URL fragment (#access_token=...&refresh_token=...).
  const fragment = url.hash?.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (fragment) {
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setSessionError) throw setSessionError;
      return sessionData.user ? { userId: sessionData.user.id } : null;
    }
    const errorDescription = params.get('error_description');
    if (errorDescription) throw new Error(errorDescription);
  }

  throw new Error('Google sign-in did not return a session. Try again.');
}
