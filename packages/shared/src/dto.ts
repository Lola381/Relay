// Response envelopes and DTOs (see docs/API_DESIGN.md §1, §3).
import type { ErrorCode } from './errors';

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
