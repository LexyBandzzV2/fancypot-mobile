import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

/**
 * Handles Supabase auth deep links on native (detectSessionInUrl is off there).
 * Password-reset emails redirect to `fancypot://reset-password#access_token=…`;
 * we parse the fragment, establish the recovery session, and open the
 * set-new-password screen. Also covers magic-link style tokens generally.
 */
function parseFragment(url: string) {
  const frag = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
  const params = new URLSearchParams(frag);
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    type: params.get('type'),
  };
}

export function useAuthDeepLinks() {
  const router = useRouter();

  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url) return;
      const { access_token, refresh_token, type } = parseFragment(url);
      if (access_token && refresh_token) {
        try {
          await supabase.auth.setSession({ access_token, refresh_token });
          if (type === 'recovery') router.push('/reset-password');
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
