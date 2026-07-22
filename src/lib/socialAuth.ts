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
 * Browser-based Google OAuth via Supabase's hosted flow (PKCE only). We open
 * Supabase's authorize URL in an in-app browser; the `fancypot://auth-callback`
 * redirect carries a one-time `?code=` that we exchange for a session. The
 * code is useless without the PKCE verifier stored on this device, so nothing
 * sensitive rides on the custom-scheme redirect — unlike the implicit flow,
 * where raw tokens in the URL fragment could be intercepted by a malicious
 * co-installed app registering the same scheme.
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

  // PKCE: exchange the one-time code (paired with the locally stored verifier)
  // for a session. No tokens ever appear in the redirect URL.
  const code = url.searchParams.get('code');
  if (code) {
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return sessionData.user ? { userId: sessionData.user.id } : null;
  }

  // No code — surface a provider error if one came back. Errors can still
  // arrive in the URL fragment (or query), even though tokens never do.
  const fragment = url.hash?.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (fragment) {
    const errorDescription = new URLSearchParams(fragment).get('error_description');
    if (errorDescription) throw new Error(errorDescription);
  }
  const queryErrorDescription = url.searchParams.get('error_description');
  if (queryErrorDescription) throw new Error(queryErrorDescription);

  throw new Error('Google sign-in did not return a session. Try again.');
}
