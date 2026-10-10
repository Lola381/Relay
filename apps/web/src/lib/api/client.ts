// Fetch wrapper for the API: base URL, JSON, Bearer token, the standard error shape, and a
// silent refresh-and-retry when the access token has expired.
import {
  ERROR_CODES,
  type ApiErrorBody,
  type ApiResponse,
  type AuthSession,
  type ErrorCode,
} from '@pm/shared';
import { API_URL } from '@/lib/env';

/** Client-only code for "the request never reached the API". */
export const NETWORK_ERROR = 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | typeof NETWORK_ERROR,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Access token: memory only (never localStorage), so injected scripts can't read it ──
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Called when the session can't be recovered; the AuthProvider sends the user to /login. */
type SessionEndedReason = 'expired' | 'deactivated';
let onSessionEnded: ((reason: SessionEndedReason) => void) | null = null;
export const setSessionEndedHandler = (handler: typeof onSessionEnded) => {
  onSessionEnded = handler;
};

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    // credentials: the refresh cookie must travel cross-origin (web :3000 → api :4000)
    res = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError(0, NETWORK_ERROR, "Can't reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      error?.code ?? ERROR_CODES.INTERNAL_ERROR,
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }
  return body as T;
}

// ── Refresh: one at a time, per tab and across tabs ──
// Rotation makes the old cookie invalid, so two refreshes racing with the same cookie would look
// like token theft. A module-level promise dedupes within the tab (and React StrictMode's double
// effects); a Web Lock serializes tabs, so the second tab sends the already-rotated cookie.
/** NO_SESSION: there was no refresh cookie at all (a normal signed-out visitor). */
export type RefreshResult =
  | { ok: true; session: AuthSession }
  | { ok: false; code: ErrorCode | typeof NETWORK_ERROR | 'NO_SESSION' };

let inFlightRefresh: Promise<RefreshResult> | null = null;

export function refreshSession(): Promise<RefreshResult> {
  inFlightRefresh ??= withCrossTabLock(async (): Promise<RefreshResult> => {
    try {
      const body = await send<ApiResponse<AuthSession> | undefined>('/auth/refresh', { method: 'POST' });
      if (!body) {
        accessToken = null;
        return { ok: false, code: 'NO_SESSION' };
      }
      accessToken = body.data.accessToken;
      return { ok: true, session: body.data };
    } catch (err) {
      accessToken = null;
      return { ok: false, code: err instanceof ApiError ? err.code : ERROR_CODES.INTERNAL_ERROR };
    }
  }).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn();
  let result!: T;
  await navigator.locks.request('pm-auth-refresh', async () => {
    result = await fn();
  });
  return result;
}

// ── Public request helper ──
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send the access token and refresh on 401 (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options;

  const attempt = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return send<T>(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  };

  try {
    return await attempt();
  } catch (err) {
    if (!(err instanceof ApiError) || !auth || err.status !== 401) throw err;

    if (err.code === ERROR_CODES.ACCOUNT_DEACTIVATED) {
      accessToken = null;
      onSessionEnded?.('deactivated');
      throw err;
    }

    // Expired access token → refresh once, then retry the original request once
    const refreshed = await refreshSession();
    if (refreshed.ok) return attempt();

    if (refreshed.code !== NETWORK_ERROR) {
      onSessionEnded?.(refreshed.code === ERROR_CODES.ACCOUNT_DEACTIVATED ? 'deactivated' : 'expired');
    }
    throw err;
  }
}
