// The permission rulebook (docs/API_DESIGN.md §2). Pure functions, no I/O.
// The API calls these to ENFORCE every request (with roles read fresh from the DB);
// the web app calls the same functions only to HIDE actions the user can't perform.
import type { ProjectRole, ProjectStatus, SystemRole } from './enums';

// ── Role ceiling: the highest project role each system role may hold ──

const ROLE_RANK: Record<ProjectRole, number> = { VIEWER: 1, MEMBER: 2, MANAGER: 3 };

const MAX_PROJECT_ROLE: Record<SystemRole, ProjectRole> = {
  ADMIN: 'MANAGER',
  PROJECT_MANAGER: 'MANAGER',
  TEAM_MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
};

export const maxProjectRole = (systemRole: SystemRole): ProjectRole => MAX_PROJECT_ROLE[systemRole];

/** e.g. a TEAM_MEMBER user can be a project MEMBER or VIEWER, never a MANAGER. */
export const canHoldProjectRole = (systemRole: SystemRole, projectRole: ProjectRole): boolean =>
  ROLE_RANK[projectRole] <= ROLE_RANK[MAX_PROJECT_ROLE[systemRole]];

/** Project roles that may be assigned tasks (viewers are read-only). */
export const isAssignableRole = (projectRole: ProjectRole): boolean => projectRole !== 'VIEWER';

// ── Actors, actions and decisions ──

export interface Actor {
  userId: string;
  systemRole: SystemRole;
  /** Membership role in the project being acted on; null = not a member (or no project). */
  projectRole: ProjectRole | null;
}

export interface ProjectCtx {
  projectStatus: ProjectStatus;
}

/** System-level actions: decided by the system role alone. */
export type SystemAction =
  | 'user.list' // user directory for the member picker
  | 'user.manage' // create / edit / deactivate users
  | 'project.create'
  | 'project.delete'
  | 'project.archive' // archive and unarchive
  | 'activity.viewSystem';

/** Project-level actions and the context each one needs (checked by the compiler). */
export interface ProjectActionContext {
  'project.view': ProjectCtx;
  'project.update': ProjectCtx;
  'member.add': ProjectCtx & { role: ProjectRole };
  'member.changeRole': ProjectCtx & { currentRole: ProjectRole; newRole: ProjectRole };
  'member.remove': ProjectCtx & { currentRole: ProjectRole };
  'task.create': ProjectCtx;
  'task.delete': ProjectCtx;
  'task.assign': ProjectCtx;
  'task.updateDetails': ProjectCtx; // title, priority, due date
  'task.updateDescription': ProjectCtx & { assigneeId: string | null };
  'task.changeStatus': ProjectCtx & { assigneeId: string | null };
  'comment.create': ProjectCtx;
  'comment.delete': ProjectCtx & { authorId: string };
  'activity.view': ProjectCtx;
}

export type ProjectAction = keyof ProjectActionContext;
export type Action = SystemAction | ProjectAction;

export type DenyReason =
  | 'NOT_MEMBER' // API answers 404, so other projects' existence isn't revealed
  | 'FORBIDDEN' // 403
  | 'PROJECT_ARCHIVED'; // 403 with its own code

export type Decision = { allowed: true } | { allowed: false; reason: DenyReason; message: string };

const ALLOW: Decision = { allowed: true };
const deny = (reason: DenyReason, message: string): Decision => ({ allowed: false, reason, message });
const forbidden = (message: string) => deny('FORBIDDEN', message);
const allowIf = (condition: boolean, message: string) => (condition ? ALLOW : forbidden(message));

// ── Rules ──

const SYSTEM_RULES: Record<SystemAction, (actor: Actor) => Decision> = {
  'user.list': (a) =>
    allowIf(
      a.systemRole === 'ADMIN' || a.systemRole === 'PROJECT_MANAGER',
      'Only administrators and project managers can browse users.',
    ),
  'user.manage': (a) => allowIf(a.systemRole === 'ADMIN', 'Only administrators can manage users.'),
  'project.create': (a) => allowIf(a.systemRole === 'ADMIN', 'Only administrators can create projects.'),
  'project.delete': (a) => allowIf(a.systemRole === 'ADMIN', 'Only administrators can delete projects.'),
  'project.archive': (a) =>
    allowIf(a.systemRole === 'ADMIN', 'Only administrators can archive or unarchive projects.'),
  'activity.viewSystem': (a) =>
    allowIf(a.systemRole === 'ADMIN', 'Only administrators can view system activity.'),
};

/** Who is acting inside a project. ADMIN = system admin (full access with or without membership). */
interface ProjectSubject {
  actor: Actor;
  role: ProjectRole | 'ADMIN';
  isAdmin: boolean;
  isManager: boolean; // ADMIN or project MANAGER
}

type ProjectRules = {
  [A in ProjectAction]: (s: ProjectSubject, ctx: ProjectActionContext[A]) => Decision;
};

const managerOnly = (message: string) => (s: ProjectSubject) => allowIf(s.isManager, message);

/** Member may act on their own assigned task; managers on any; viewers never. */
const assigneeOrManager = (s: ProjectSubject, ctx: { assigneeId: string | null }) => {
  if (s.isManager) return ALLOW;
  if (s.role === 'VIEWER') return forbidden('Viewers have read-only access.');
  return allowIf(ctx.assigneeId === s.actor.userId, 'You can only update tasks assigned to you.');
};

const PROJECT_RULES: ProjectRules = {
  'project.view': () => ALLOW, // every member, including viewers
  'activity.view': () => ALLOW,
  'project.update': managerOnly('Only project managers can edit the project.'),

  'member.add': (s, ctx) => {
    if (!s.isManager) return forbidden('Only project managers can add members.');
    return allowIf(ctx.role !== 'MANAGER' || s.isAdmin, 'Only administrators can assign project managers.');
  },
  'member.changeRole': (s, ctx) => {
    if (!s.isManager) return forbidden('Only project managers can change roles.');
    const touchesManager = ctx.currentRole === 'MANAGER' || ctx.newRole === 'MANAGER';
    return allowIf(!touchesManager || s.isAdmin, 'Only administrators can grant or revoke the manager role.');
  },
  'member.remove': (s, ctx) => {
    if (!s.isManager) return forbidden('Only project managers can remove members.');
    return allowIf(ctx.currentRole !== 'MANAGER' || s.isAdmin, 'Only administrators can remove a project manager.');
  },

  'task.create': managerOnly('Only project managers can create tasks.'),
  'task.delete': managerOnly('Only project managers can delete tasks.'),
  'task.assign': managerOnly('Only project managers can assign tasks.'),
  'task.updateDetails': managerOnly('Only project managers can change the title, priority or due date.'),
  'task.updateDescription': assigneeOrManager,
  'task.changeStatus': assigneeOrManager,

  'comment.create': (s) => allowIf(s.role !== 'VIEWER', 'Viewers have read-only access.'),
  'comment.delete': (s, ctx) => {
    if (s.isManager) return ALLOW;
    return allowIf(
      s.role !== 'VIEWER' && ctx.authorId === s.actor.userId,
      'You can only delete your own comments.',
    );
  },
};

const READ_ONLY = new Set<ProjectAction>(['project.view', 'activity.view']);

// ── Entry point ──

type Args<A extends Action> = A extends ProjectAction ? [context: ProjectActionContext[A]] : [];

/**
 * Can `actor` perform `action`? For project actions, `actor.projectRole` must be the role in
 * THAT project, and the context the action requires is enforced by the type system.
 */
export function can<A extends Action>(actor: Actor, action: A, ...args: Args<A>): Decision {
  if (action in SYSTEM_RULES) return SYSTEM_RULES[action as SystemAction](actor);

  const projectAction = action as ProjectAction;
  const context = args[0] as ProjectActionContext[ProjectAction];
  const isAdmin = actor.systemRole === 'ADMIN';
  const role = isAdmin ? 'ADMIN' : actor.projectRole;

  if (role === null) return deny('NOT_MEMBER', 'Project not found.');
  if (!READ_ONLY.has(projectAction) && context.projectStatus === 'ARCHIVED') {
    return deny('PROJECT_ARCHIVED', 'This project is archived and read-only.');
  }

  const subject: ProjectSubject = { actor, role, isAdmin, isManager: isAdmin || role === 'MANAGER' };
  const rule = PROJECT_RULES[projectAction] as (s: ProjectSubject, ctx: typeof context) => Decision;
  return rule(subject, context);
}

/** Convenience for UI code: true/false only. */
export const isAllowed = <A extends Action>(actor: Actor, action: A, ...args: Args<A>): boolean =>
  can(actor, action, ...args).allowed;
