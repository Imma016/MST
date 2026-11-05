import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isGoogleAuthEnabled, supabase } from '../../lib/supabase';

type ActionResult = { error: string | null; message?: string };
type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  passwordRecovery: boolean;
  googleAuthEnabled: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<ActionResult>;
  signIn: (email: string, password: string) => Promise<ActionResult>;
  signInWithGoogle: () => Promise<ActionResult>;
  requestPasswordReset: (email: string) => Promise<ActionResult>;
  updatePassword: (password: string) => Promise<ActionResult>;
  signOut: () => Promise<ActionResult>;
  clearPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hasRecoveryLink() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return query.get('type') === 'recovery' || hash.get('type') === 'recovery' || query.get('passwordRecovery') === '1';
}

function redirectUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

function clearRecoveryAddress() {
  const url = new URL(window.location.href);
  url.searchParams.delete('type');
  url.searchParams.delete('passwordRecovery');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [passwordRecovery, setPasswordRecovery] = useState(hasRecoveryLink);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (error) console.error('Unable to restore MST session:', error.message);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    // The database function throttles this to one timestamp update per 15 minutes.
    void Promise.resolve(supabase.rpc('record_my_activity')).catch(() => undefined);
  }, [session?.user.id]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(supabase),
    loading,
    session,
    passwordRecovery,
    googleAuthEnabled: isGoogleAuthEnabled,
    async signUp(email, password, displayName) {
      if (!supabase) return { error: 'MST accounts are not connected yet.' };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl(),
          data: { display_name: displayName.trim() },
        },
      });
      if (error) return { error: error.message };
      return {
        error: null,
        message: data.session
          ? 'Your account is ready.'
          : 'Check your email for a confirmation link, then sign in.',
      };
    },
    async signIn(email, password) {
      if (!supabase) return { error: 'MST accounts are not connected yet.' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signInWithGoogle() {
      if (!supabase) return { error: 'MST accounts are not connected yet.' };
      if (!isGoogleAuthEnabled) return { error: 'Google sign-in is not configured yet.' };
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl() },
      });
      return { error: error?.message ?? null };
    },
    async requestPasswordReset(email) {
      if (!supabase) return { error: 'MST accounts are not connected yet.' };
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
      return error
        ? { error: error.message }
        : { error: null, message: 'If an account uses that email, a reset link is on its way.' };
    },
    async updatePassword(password) {
      if (!supabase) return { error: 'MST accounts are not connected yet.' };
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) {
        setPasswordRecovery(false);
        clearRecoveryAddress();
      }
      return { error: error?.message ?? null, message: error ? undefined : 'Your password has been updated.' };
    },
    async signOut() {
      if (!supabase) return { error: 'MST accounts are not connected yet.' };
      const { error } = await supabase.auth.signOut();
      return { error: error?.message ?? null };
    },
    clearPasswordRecovery() {
      setPasswordRecovery(false);
      clearRecoveryAddress();
    },
  }), [loading, session, passwordRecovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
