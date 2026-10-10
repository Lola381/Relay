'use client';

import { canHoldProjectRole, PROJECT_ROLES, type Project, type ProjectMember, type ProjectRole } from '@pm/shared';
import { Tile, TileActions } from '@/components/metro/Tile';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { initials, plural, projectRoleLabel } from '@/lib/format';
import { canInProject } from '@/lib/permissions';

/** Person tile on the Team page; the back holds role changes and removal when allowed. */
export function MemberTile({
  project,
  member,
  onChangeRole,
  onRemove,
}: {
  project: Project;
  member: ProjectMember;
  onChangeRole: (member: ProjectMember, role: ProjectRole) => void;
  onRemove: (member: ProjectMember) => void;
}) {
  const user = useCurrentUser();
  const { user: person, role } = member;

  // A role is offered only if the rulebook allows it AND the person's account type can hold it
  const roleOptions = PROJECT_ROLES.filter(
    (next) =>
      canHoldProjectRole(person.role, next) &&
      canInProject(user, project, 'member.changeRole', { currentRole: role, newRole: next }),
  );
  const canChange = roleOptions.some((r) => r !== role);
  const canRemove = canInProject(user, project, 'member.remove', { currentRole: role });

  const front = (
    <>
      <span className="text-lg">{initials(person.name)}</span>
      <p className="mt-auto truncate text-[24px] leading-tight font-light">{person.name}</p>
      <p className="mt-1 truncate text-xs">{person.email}</p>
      <p className="mt-1 text-sm">{person.isActive ? projectRoleLabel(role) : 'Deactivated'}</p>
    </>
  );

  const back = (
    <>
      <p className="truncate pr-8 text-lg font-light">{person.name}</p>
      <p className="text-sm">{plural(member.openTaskCount, 'open task')} here</p>
      {canChange && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Change role">
          {roleOptions.map((next) => (
            <button
              key={next}
              type="button"
              aria-pressed={next === role}
              disabled={next === role}
              onClick={() => onChangeRole(member, next)}
              className="border border-white/70 px-2 py-0.5 text-xs aria-pressed:bg-white aria-pressed:text-tile-user hover:bg-white/15"
            >
              {projectRoleLabel(next)}
            </button>
          ))}
        </div>
      )}
      <TileActions>
        {canRemove && (
          <button type="button" onClick={() => onRemove(member)}>
            Remove
          </button>
        )}
      </TileActions>
    </>
  );

  return (
    <Tile
      size="medium"
      tone="user"
      label={`${person.name}, ${person.isActive ? projectRoleLabel(role) : 'deactivated'}`}
      front={front}
      back={back}
      dimmed={!person.isActive}
    />
  );
}
