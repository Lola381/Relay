// Turns a rulebook decision (@pm/shared permissions) into the matching HTTP error.
import {
  can,
  ERROR_CODES,
  type Actor,
  type Decision,
  type ProjectAction,
  type ProjectActionContext,
  type SystemAction,
} from '@pm/shared';
import { AppError, forbidden, notFound } from '../lib/errors';
import type { ProjectAccess } from './projectAccess';

function throwIfDenied(decision: Decision): void {
  if (decision.allowed) return;
  switch (decision.reason) {
    case 'NOT_MEMBER':
      throw notFound(decision.message);
    case 'PROJECT_ARCHIVED':
      throw new AppError(403, ERROR_CODES.PROJECT_ARCHIVED, decision.message);
    case 'FORBIDDEN':
      throw forbidden(decision.message);
  }
}

/** System-level check (user management, project creation, system activity…). */
export function assertSystemCan(actor: Pick<Actor, 'userId' | 'systemRole'>, action: SystemAction): void {
  throwIfDenied(can({ ...actor, projectRole: null }, action));
}

/**
 * Project-level check. The project's status comes from the loaded access (never the client),
 * so writes to archived projects are refused centrally.
 */
export function assertProjectCan<A extends ProjectAction>(
  access: ProjectAccess,
  action: A,
  ...extra: keyof Omit<ProjectActionContext[A], 'projectStatus'> extends never
    ? []
    : [context: Omit<ProjectActionContext[A], 'projectStatus'>]
): void {
  const context = { ...(extra[0] ?? {}), projectStatus: access.project.status } as ProjectActionContext[A];
  throwIfDenied((can as (a: Actor, x: A, c: ProjectActionContext[A]) => Decision)(access.actor, action, context));
}
