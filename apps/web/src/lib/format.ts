import type { SystemRole } from '@pm/shared';

const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'Project manager',
  TEAM_MEMBER: 'Team member',
  VIEWER: 'Viewer',
};

export const roleLabel = (role: SystemRole) => SYSTEM_ROLE_LABELS[role];

/** "Alice Fernandes" → "AF" (avatar placeholder). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
