// Response envelopes and DTOs (see docs/API_DESIGN.md §1, §3).
import type { ProjectRole, ProjectStatus, SystemRole, TaskStatus } from './enums';
import type { ErrorCode } from './errors';

/** Minimal person reference used inside other resources. */
export interface UserRef {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** A user as listed in the directory / pickers. Never includes secrets. */
export interface UserSummary extends UserRef {
  email: string;
  role: SystemRole;
  isActive: boolean;
}

export interface ProjectStats {
  memberCount: number;
  taskCount: number;
  taskCounts: Record<TaskStatus, number>;
  overdueCount: number;
  unassignedCount: number;
  commentCount: number;
  /** Open (not DONE) tasks assigned to the caller in this project. */
  myOpenTaskCount: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  version: number;
  /** The caller's role here: ADMIN for system admins, otherwise their project role. */
  myRole: ProjectRole | 'ADMIN';
  managers: UserRef[];
  createdBy: UserRef;
  stats: ProjectStats;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ProjectMember {
  projectId: string;
  user: UserSummary;
  role: ProjectRole;
  /** Open tasks assigned to this member in this project (they'd be unassigned on removal). */
  openTaskCount: number;
  addedAt: string;
}

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
