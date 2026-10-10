// Response envelopes and DTOs (see docs/API_DESIGN.md §1, §3).
import type { SystemRole } from './enums';
import type { ErrorCode } from './errors';

/** The signed-in user, as returned by /auth/login, /auth/refresh and /auth/me. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: SystemRole;
  avatarUrl: string | null;
}

/** Body of a successful login or refresh. The refresh token travels only in an httpOnly cookie. */
export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface ApiResponse<T> {
  data: T;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  uptimeSeconds: number;
}
