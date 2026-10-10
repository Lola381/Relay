'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearSessionStart, markSessionStart } from './historyGuard';
import { ERROR_CODES, type ApiResponse, type AuthSession, type AuthUser, type LoginInput, type RegisterInput } from '@pm/shared';
import {
  api,
  NETWORK_ERROR,
  refreshSession,
  setAccessToken,
  setSessionEndedHandler,
} from '@/lib/api/client';

/** Why the user is signed out; the login page shows a matching message. */
export type SignedOutReason = 'expired' | 'deactivated' | 'signed-out';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous'; reason?: SignedOutReason }
  | { status: 'unreachable' }; // API down on first load: show retry, don't pretend to be signed out

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Restore the session on load from the httpOnly refresh cookie (survives page reloads).
  // State starts as 'loading', so nothing is set synchronously here.
  const restore = useCallback(() => {
    void refreshSession().then((result) => {
      if (result.ok) setState({ status: 'authenticated', user: result.session.user });
      else if (result.code === NETWORK_ERROR) setState({ status: 'unreachable' });
      else
        setState({
          status: 'anonymous',
          reason: result.code === ERROR_CODES.ACCOUNT_DEACTIVATED ? 'deactivated' : undefined,
        });
    });
  }, []);

  useEffect(restore, [restore]);

  // A page restored from the back/forward cache could show a previous session's screen: reload it
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    setSessionEndedHandler((reason) => {
      queryClient.clear(); // never show one user's cached data to the next
      setState({ status: 'anonymous', reason });
    });
    return () => setSessionEndedHandler(null);
  }, [queryClient]);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await api<ApiResponse<AuthSession>>('/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
    });
    setAccessToken(data.accessToken);
    queryClient.clear(); // never show anything cached from a previous user
    markSessionStart();
    setState({ status: 'authenticated', user: data.user });
  }, [queryClient]);

  const register = useCallback(async (input: RegisterInput) => {
    const { data } = await api<ApiResponse<AuthSession>>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
    setAccessToken(data.accessToken);
    queryClient.clear(); // never show anything cached from a previous user
    markSessionStart();
    setState({ status: 'authenticated', user: data.user });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', auth: false });
    } catch {
      // Signing out locally must work even if the API is unreachable
    }
    setAccessToken(null);
    queryClient.clear();
    clearSessionStart();
    // Full page load: wipes everything held in memory, and replaces this history entry so
    // Back doesn't return to the signed-in screen
    window.location.replace('/login?reason=signed-out');
  }, [queryClient]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    restore();
  }, [restore]);

  const value = useMemo(() => ({ state, login, register, logout, retry }), [state, login, register, logout, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** For components inside the authenticated area: the signed-in user. */
export function useCurrentUser(): AuthUser {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useCurrentUser used outside the signed-in area');
  return state.user;
}

/** Only allow same-site paths after login (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}
