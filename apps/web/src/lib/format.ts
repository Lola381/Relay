import { format, isToday, isYesterday } from 'date-fns';
import type { Project, ProjectRole, SystemRole, TaskStatus } from '@pm/shared';

const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'Project manager',
  TEAM_MEMBER: 'Team member',
  VIEWER: 'Viewer',
};

const PROJECT_ROLE_LABELS: Record<ProjectRole | 'ADMIN', string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};

export const roleLabel = (role: SystemRole) => SYSTEM_ROLE_LABELS[role];
export const projectRoleLabel = (role: ProjectRole | 'ADMIN') => PROJECT_ROLE_LABELS[role];

/** "Alice Fernandes" → "AF" (avatar placeholder). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "Today, 10:24" · "Yesterday" · "Oct 8" (UI list dates). */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return 'Yesterday';
  return format(date, date.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}

export const longDate = (iso: string) => format(new Date(iso), 'MMM d, yyyy');

export function projectProgress(project: Pick<Project, 'stats'>) {
  const done = project.stats.taskCounts.DONE;
  const total = project.stats.taskCount;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
