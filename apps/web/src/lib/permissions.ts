// The same rulebook the API enforces (@pm/shared), used here ONLY to hide actions the user can't
// perform. The server re-checks everything; a 403 from it is still handled gracefully.
import {
  can,
  type Actor,
  type AuthUser,
  type Project,
  type ProjectAction,
  type ProjectActionContext,
  type SystemAction,
} from '@pm/shared';

export function projectActor(user: AuthUser, project: Pick<Project, 'myRole'>): Actor {
  return {
    userId: user.id,
    systemRole: user.role,
    projectRole: project.myRole === 'ADMIN' ? null : project.myRole,
  };
}

/** Can `user` do `action` in `project`? (projectStatus is taken from the project.) */
export function canInProject<A extends ProjectAction>(
  user: AuthUser,
  project: Pick<Project, 'myRole' | 'status'>,
  action: A,
  ...extra: keyof Omit<ProjectActionContext[A], 'projectStatus'> extends never
    ? []
    : [context: Omit<ProjectActionContext[A], 'projectStatus'>]
): boolean {
  const context = { ...(extra[0] ?? {}), projectStatus: project.status } as ProjectActionContext[A];
  return (can as (a: Actor, x: A, c: ProjectActionContext[A]) => { allowed: boolean })(
    projectActor(user, project),
    action,
    context,
  ).allowed;
}

export const canInSystem = (user: AuthUser, action: SystemAction): boolean =>
  can({ userId: user.id, systemRole: user.role, projectRole: null }, action).allowed;
