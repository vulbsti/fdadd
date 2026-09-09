'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';

type AuthActionResult = {
  ok: boolean;
  message?: string;
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  configured: boolean;
  error: string | null;
  notice: string | null;
  clearFeedback: () => void;
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  signUpWithEmail: (
    email: string,
    password: string,
    name: string
  ) => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clearFeedback = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let mounted = true;

    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setError(userError?.message ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) setError(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  const unavailable = useCallback((): AuthActionResult => {
    const message = 'Authentication is not configured yet.';
    setError(message);
    return { ok: false, message };
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (!configured) return unavailable();
      clearFeedback();
      setLoading(true);

      const { error: signInError } = await createClient().auth.signInWithPassword({
        email,
        password,
      });

      setLoading(false);
      if (signInError) {
        setError(signInError.message);
        return { ok: false, message: signInError.message };
      }

      return { ok: true };
    },
    [clearFeedback, configured, unavailable]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, name: string): Promise<AuthActionResult> => {
      if (!configured) return unavailable();
      clearFeedback();
      setLoading(true);

      const { data, error: signUpError } = await createClient().auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile`,
        },
      });

      setLoading(false);
      if (signUpError) {
        setError(signUpError.message);
        return { ok: false, message: signUpError.message };
      }

      if (!data.session) {
        const message = 'Check your email to confirm your account, then sign in.';
        setNotice(message);
        return { ok: true, message };
      }

      return { ok: true };
    },
    [clearFeedback, configured, unavailable]
  );

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    if (!configured) return unavailable();
    clearFeedback();
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/callback?next=/profile`;
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (oauthError) {
      setLoading(false);
      setError(oauthError.message);
      return { ok: false, message: oauthError.message };
    }

    return { ok: true };
  }, [clearFeedback, configured, unavailable]);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!configured) return unavailable();
    clearFeedback();
    setLoading(true);

    const { error: signOutError } = await createClient().auth.signOut();
    setLoading(false);

    if (signOutError) {
      setError(signOutError.message);
      return { ok: false, message: signOutError.message };
    }

    setUser(null);
    return { ok: true };
  }, [clearFeedback, configured, unavailable]);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured,
      error,
      notice,
      clearFeedback,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [
      user,
      loading,
      configured,
      error,
      notice,
      clearFeedback,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
