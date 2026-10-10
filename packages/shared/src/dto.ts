// Response envelopes and DTOs (see docs/API_DESIGN.md §1, §3).
import type {
  ActivityAction,
  ActivityEntityType,
  NotificationEntityType,
  NotificationType,
  ProjectRole,
  ProjectStatus,
  SystemRole,
  TaskPriority,
  TaskStatus,
} from './enums';
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

export interface Task {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: (UserRef & { isActive: boolean }) | null;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  isOverdue: boolean;
  completedAt: string | null;
  version: number;
  commentCount: number;
  createdBy: UserRef;
  updatedBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  projectId: string;
  author: UserRef & { isActive: boolean };
  /** May contain mention tokens: @[Name](userId) */
  body: string;
  mentions: UserRef[];
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  projectId: string | null;
  actor: UserRef | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
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

export interface Notification {
  id: string;
  type: NotificationType;
  actor: UserRef | null;
  projectId: string | null;
  entityType: NotificationEntityType;
  entityId: string;
  /** Snapshot: actorName, projectName, taskTitle, role, from/to… */
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage extends Paginated<Notification> {
  unreadCount: number;
}

/** A real-time message on GET /events (Server-Sent Events). */
export interface LiveEvent {
  type: string;
  projectId?: string;
  actorId?: string;
  data: unknown;
}

/** GET /dashboard: one role-aware summary for the Start screen. */
export interface DashboardSummary {
  myTasks: { open: number; overdue: number; byStatus: Record<TaskStatus, number> };
  projects: { id: string; name: string; status: ProjectStatus; myRole: ProjectRole | 'ADMIN'; taskCount: number; doneCount: number }[];
  unreadNotifications: number;
  recentActivity: ActivityEntry[];
  /** Admin only: system-wide counts. */
  system?: { users: number; activeUsers: number; projects: number; activeProjects: number; tasks: number };
}
