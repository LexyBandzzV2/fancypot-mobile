import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

/**
 * Handles Supabase auth deep links on native (detectSessionInUrl is off there).
 * With PKCE flow enabled, password-reset emails redirect to
 * `fancypot://reset-password?code=…` — a one-time code that is useless without
 * the verifier this install stored when the reset was requested. We exchange
 * it for a recovery session and open the set-new-password screen. Raw tokens
 * never appear in the link (that was the implicit flow, removed for security).
 */
function parseAuthLink(url: string) {
  // PKCE params arrive in the query string; strip any fragment first.
  const [withoutFragment] = url.split('#');
  const query = withoutFragment.includes('?')
    ? withoutFragment.slice(withoutFragment.indexOf('?') + 1)
    : '';
  const params = new URLSearchParams(query);
  return {
    code: params.get('code'),
    type: params.get('type'),
  };
}

export function useAuthDeepLinks() {
  const router = useRouter();

  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url) return;
      // The Google OAuth redirect (fancypot://auth-callback?code=…) is owned
      // by signInWithGoogle's in-app browser session — don't consume its
      // one-time code here or the pending exchange there would fail.
      if (url.includes('auth-callback')) return;
      const { code, type } = parseAuthLink(url);
      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return; // expired/replayed/malformed link — ignore
          if (type === 'recovery' || url.includes('reset-password')) {
            router.push('/reset-password');
          }
        } catch {
          // ignore malformed links
        }
      }
    };

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [router]);
}
