import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
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

  const loadProfile = useCallback(async (userId: string) => {
    // profiles is keyed by user_id (its id column is a separate row UUID).
    // maybeSingle avoids a 406 if the row hasn't landed yet.
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('user_id', userId)
      .maybeSingle();

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
    setProfile((created as Profile) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!mounted) return;
      setSession(next);
      if (next?.user) {
        await loadProfile(next.user.id);
      } else {
        setProfile(null);
      }
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
    const { data, error } = await supabase.auth.signUp({ email, password });
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
    if (session?.user) await loadProfile(session.user.id);
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
