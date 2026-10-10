// Single source of truth for every enum in the system (see docs/DATA_MODEL.md).
// Arrays are used by Zod schemas and DB CHECK constraints; the derived types by the code.

export const SYSTEM_ROLES = ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const PROJECT_ROLES = ['MANAGER', 'MEMBER', 'VIEWER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const ACTIVITY_ACTIONS = [
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'PROJECT_UNARCHIVED',
  'PROJECT_DELETED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_ROLE_CHANGED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_ASSIGNED',
  'TASK_UNASSIGNED',
  'TASK_STATUS_CHANGED',
  'TASK_DELETED',
  'COMMENT_ADDED',
  'COMMENT_DELETED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'USER_ACTIVATED',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_ENTITY_TYPES = ['USER', 'PROJECT', 'MEMBER', 'TASK', 'COMMENT'] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_UNASSIGNED',
  'TASK_STATUS_CHANGED',
  'TASK_UPDATED',
  'COMMENT_ADDED',
  'MENTIONED',
  'PROJECT_MEMBER_ADDED',
  'PROJECT_MEMBER_REMOVED',
  'PROJECT_ROLE_CHANGED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_ENTITY_TYPES = ['PROJECT', 'TASK', 'COMMENT'] as const;
export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];
