// The rulebook against the permission matrix in docs/API_DESIGN.md §2, cell by cell.
import { describe, expect, it } from 'vitest';
import {
  can,
  canHoldProjectRole,
  maxProjectRole,
  type Actor,
  type ProjectAction,
  type ProjectActionContext,
  type SystemAction,
} from '@pm/shared';

const ME = 'me-0000';
const OTHER = 'other-0000';

const ACTORS = {
  ADMIN: { userId: ME, systemRole: 'ADMIN', projectRole: null },
  MANAGER: { userId: ME, systemRole: 'PROJECT_MANAGER', projectRole: 'MANAGER' },
  MEMBER: { userId: ME, systemRole: 'TEAM_MEMBER', projectRole: 'MEMBER' },
  VIEWER: { userId: ME, systemRole: 'VIEWER', projectRole: 'VIEWER' },
  OUTSIDER: { userId: ME, systemRole: 'TEAM_MEMBER', projectRole: null },
} satisfies Record<string, Actor>;
type Who = keyof typeof ACTORS;
const WHO: Who[] = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'OUTSIDER'];

type Expect = 'allow' | 'deny' | '404';
type Row<A extends ProjectAction = ProjectAction> = {
  label: string;
  action: A;
  ctx: Omit<ProjectActionContext[A], 'projectStatus'>;
  //       ADMIN   MANAGER MEMBER  VIEWER  OUTSIDER
  expect: [Expect, Expect, Expect, Expect, Expect];
};
const row = <A extends ProjectAction>(r: Row<A>) => r as unknown as Row;

// Matrix for an ACTIVE project
const MATRIX: Row[] = [
  row({ label: 'view project', action: 'project.view', ctx: {}, expect: ['allow', 'allow', 'allow', 'allow', '404'] }),
  row({ label: 'view activity', action: 'activity.view', ctx: {}, expect: ['allow', 'allow', 'allow', 'allow', '404'] }),
  row({ label: 'edit project details', action: 'project.update', ctx: {}, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'add a MEMBER', action: 'member.add', ctx: { role: 'MEMBER' }, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'add a MANAGER', action: 'member.add', ctx: { role: 'MANAGER' }, expect: ['allow', 'deny', 'deny', 'deny', '404'] }),
  row({ label: 'change MEMBER → VIEWER', action: 'member.changeRole', ctx: { currentRole: 'MEMBER', newRole: 'VIEWER' }, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'promote MEMBER → MANAGER', action: 'member.changeRole', ctx: { currentRole: 'MEMBER', newRole: 'MANAGER' }, expect: ['allow', 'deny', 'deny', 'deny', '404'] }),
  row({ label: 'demote MANAGER → MEMBER', action: 'member.changeRole', ctx: { currentRole: 'MANAGER', newRole: 'MEMBER' }, expect: ['allow', 'deny', 'deny', 'deny', '404'] }),
  row({ label: 'remove a MEMBER', action: 'member.remove', ctx: { currentRole: 'MEMBER' }, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'remove a MANAGER', action: 'member.remove', ctx: { currentRole: 'MANAGER' }, expect: ['allow', 'deny', 'deny', 'deny', '404'] }),
  row({ label: 'create task', action: 'task.create', ctx: {}, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'delete task', action: 'task.delete', ctx: {}, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'assign task', action: 'task.assign', ctx: {}, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'edit title/priority/due date', action: 'task.updateDetails', ctx: {}, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'change status of MY task', action: 'task.changeStatus', ctx: { assigneeId: ME }, expect: ['allow', 'allow', 'allow', 'deny', '404'] }),
  row({ label: "change status of SOMEONE ELSE's task", action: 'task.changeStatus', ctx: { assigneeId: OTHER }, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'change status of an UNASSIGNED task', action: 'task.changeStatus', ctx: { assigneeId: null }, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'edit description of MY task', action: 'task.updateDescription', ctx: { assigneeId: ME }, expect: ['allow', 'allow', 'allow', 'deny', '404'] }),
  row({ label: "edit description of SOMEONE ELSE's task", action: 'task.updateDescription', ctx: { assigneeId: OTHER }, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
  row({ label: 'add comment', action: 'comment.create', ctx: {}, expect: ['allow', 'allow', 'allow', 'deny', '404'] }),
  row({ label: 'delete MY comment', action: 'comment.delete', ctx: { authorId: ME }, expect: ['allow', 'allow', 'allow', 'deny', '404'] }),
  row({ label: "delete SOMEONE ELSE's comment", action: 'comment.delete', ctx: { authorId: OTHER }, expect: ['allow', 'allow', 'deny', 'deny', '404'] }),
];

const decide = (who: Who, r: Row, projectStatus: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') =>
  (can as (a: Actor, x: ProjectAction, c: object) => ReturnType<typeof can>)(ACTORS[who], r.action, {
    ...r.ctx,
    projectStatus,
  });

describe('project permission matrix (active project)', () => {
  const cases = MATRIX.flatMap((r) => WHO.map((who, i) => ({ who, r, expected: r.expect[i]! })));

  it.each(cases)('$who → $r.label: $expected', ({ who, r, expected }) => {
    const decision = decide(who, r);
    if (expected === 'allow') {
      expect(decision).toEqual({ allowed: true });
    } else {
      expect(decision.allowed).toBe(false);
      // Outsiders are told "not found" (404), never "forbidden", so they can't probe projects
      expect(decision).toMatchObject({ reason: expected === '404' ? 'NOT_MEMBER' : 'FORBIDDEN' });
    }
  });

  it('every denial carries a human-readable message', () => {
    for (const r of MATRIX) {
      for (const who of WHO) {
        const decision = decide(who, r);
        if (!decision.allowed) expect(decision.message.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('archived projects are read-only for everyone', () => {
  const reads = new Set<ProjectAction>(['project.view', 'activity.view']);

  it.each(MATRIX.filter((r) => !reads.has(r.action)))('nobody can "$label"', (r) => {
    for (const who of ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const) {
      expect(decide(who, r, 'ARCHIVED')).toMatchObject({ allowed: false, reason: 'PROJECT_ARCHIVED' });
    }
  });

  it('members can still read it', () => {
    for (const r of MATRIX.filter((x) => reads.has(x.action))) {
      for (const who of ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const) {
        expect(decide(who, r, 'ARCHIVED').allowed).toBe(true);
      }
    }
  });

  it('outsiders still get 404, not "archived" (no information leak)', () => {
    expect(decide('OUTSIDER', MATRIX[0]!, 'ARCHIVED')).toMatchObject({ reason: 'NOT_MEMBER' });
    expect(decide('OUTSIDER', MATRIX.find((r) => r.action === 'task.create')!, 'ARCHIVED')).toMatchObject({
      reason: 'NOT_MEMBER',
    });
  });
});

describe('system-level permissions', () => {
  const systemRoles = ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER'] as const;
  const expectations: Record<SystemAction, (typeof systemRoles)[number][]> = {
    'user.manage': ['ADMIN'],
    'project.create': ['ADMIN'],
    'project.delete': ['ADMIN'],
    'project.archive': ['ADMIN'],
    'activity.viewSystem': ['ADMIN'],
    'user.list': ['ADMIN', 'PROJECT_MANAGER'],
  };

  for (const [action, allowedRoles] of Object.entries(expectations) as [SystemAction, string[]][]) {
    it.each(systemRoles)(`${action}: %s`, (systemRole) => {
      const decision = can({ userId: ME, systemRole, projectRole: null }, action);
      expect(decision.allowed).toBe(allowedRoles.includes(systemRole));
      if (!decision.allowed) expect(decision.reason).toBe('FORBIDDEN');
    });
  }
});

describe('edge cases', () => {
  it('an admin keeps full power even when listed as a plain MEMBER of the project', () => {
    const adminAsMember: Actor = { userId: ME, systemRole: 'ADMIN', projectRole: 'MEMBER' };
    expect(can(adminAsMember, 'task.delete', { projectStatus: 'ACTIVE' }).allowed).toBe(true);
    expect(can(adminAsMember, 'member.add', { projectStatus: 'ACTIVE', role: 'MANAGER' }).allowed).toBe(true);
  });

  it('a project-manager user who is only a MEMBER of this project acts as a member here', () => {
    const pmAsMember: Actor = { userId: ME, systemRole: 'PROJECT_MANAGER', projectRole: 'MEMBER' };
    expect(can(pmAsMember, 'task.delete', { projectStatus: 'ACTIVE' }).allowed).toBe(false);
  });

  it('a viewer cannot change the status even of a task assigned to them', () => {
    expect(can(ACTORS.VIEWER, 'task.changeStatus', { projectStatus: 'ACTIVE', assigneeId: ME })).toMatchObject({
      allowed: false,
      reason: 'FORBIDDEN',
    });
  });
});

describe('role ceiling (system role → highest project role)', () => {
  it.each([
    ['ADMIN', 'MANAGER'],
    ['PROJECT_MANAGER', 'MANAGER'],
    ['TEAM_MEMBER', 'MEMBER'],
    ['VIEWER', 'VIEWER'],
  ] as const)('%s → at most %s', (systemRole, max) => {
    expect(maxProjectRole(systemRole)).toBe(max);
  });

  it('a TEAM_MEMBER cannot be a project MANAGER; a VIEWER can only be a VIEWER', () => {
    expect(canHoldProjectRole('TEAM_MEMBER', 'MANAGER')).toBe(false);
    expect(canHoldProjectRole('TEAM_MEMBER', 'MEMBER')).toBe(true);
    expect(canHoldProjectRole('TEAM_MEMBER', 'VIEWER')).toBe(true);
    expect(canHoldProjectRole('VIEWER', 'MEMBER')).toBe(false);
    expect(canHoldProjectRole('PROJECT_MANAGER', 'MANAGER')).toBe(true);
  });
});
