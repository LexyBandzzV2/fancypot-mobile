import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { PlanValue } from '@/lib/plans';

export interface Profile {
  id: string;
  /** FK to auth.users — profiles.id is the row's own UUID, NOT the auth uid. */
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: PlanValue;
  phone: string | null;
  phone_verified: boolean;
  preferences: Record<string, unknown> | null;
  ai_blocked: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True until the initial session + profile fetch settles. */
  initializing: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const PROFILE_COLS =
    'id, user_id, display_name, avatar_url, plan, phone, phone_verified, preferences, ai_blocked';

  // The user whose profile we most recently asked for. Profile loads are
  // deferred off the auth callback (see below), so a quick sign-out/sign-in can
  // land an older response after a newer one — this drops the stale write.
  const latestUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    // profiles is keyed by user_id (its id column is a separate row UUID).
    // maybeSingle avoids a 406 if the row hasn't landed yet.
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('user_id', userId)
      .maybeSingle();

    if (latestUserId.current !== userId) return;

    if (data) {
      setProfile(data as Profile);
      return;
    }
    if (error) {
      setProfile(null);
      return;
    }

    // The handle_new_user trigger normally creates the row at signup; this is a
    // safety net if it ever hasn't. RLS permits inserts where auth.uid() = user_id.
    const { data: created } = await supabase
      .from('profiles')
      .upsert({ user_id: userId }, { onConflict: 'user_id' })
      .select(PROFILE_COLS)
      .maybeSingle();
    if (latestUserId.current !== userId) return;
    setProfile((created as Profile) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      const userId = data.session?.user?.id ?? null;
      latestUserId.current = userId;
      if (!userId) {
        setInitializing(false);
        return;
      }
      loadProfile(userId).finally(() => {
        if (mounted) setInitializing(false);
      });
    }).catch(() => {
      // getSession can reject on a SecureStore read failure or processLock timeout.
      // Failing silently leaves the splash screen forever. Reset the gate.
      if (mounted) setInitializing(false);
    });

    /**
     * Never `await` a supabase call in here, and never make this callback
     * `async`. GoTrue runs `exchangeCodeForSession` (the Google OAuth leg) and
     * every token refresh *while holding its internal auth lock*, and it awaits
     * each subscriber before releasing it. Any supabase call made from in here
     * needs `getSession()`, which wants that same lock — a circular await with
     * no timeout on the nested branch. That deadlock hangs Google sign-in
     * forever and, because the lock is never released, freezes every later
     * query app-wide until the app is relaunched.
     *
     * So: set state synchronously, and defer the profile fetch to a macrotask,
     * which cannot run until the lock has been released.
     */
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      const userId = next?.user?.id ?? null;
      latestUserId.current = userId;
      if (!userId) {
        setProfile(null);
        return;
      }
      setTimeout(() => {
        if (mounted) void loadProfile(userId);
      }, 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // If email confirmation is on, the link has to come back to the app, not
      // to the website — useAuthDeepLinks exchanges the code it carries. Needs
      // `fancypot://auth-confirm` on the Supabase redirect allowlist.
      options: { emailRedirectTo: 'fancypot://auth-confirm' },
    });
    if (error) throw error;
    // If email confirmation is on, there is no session yet.
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'fancypot://reset-password',
    });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    latestUserId.current = userId;
    await loadProfile(userId);
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      initializing,
      signInWithPassword,
      signUp,
      signOut,
      sendPasswordReset,
      refreshProfile,
    }),
    [session, profile, initializing, signInWithPassword, signUp, signOut, sendPasswordReset, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
