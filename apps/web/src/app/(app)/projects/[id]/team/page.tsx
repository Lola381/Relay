'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProjectMember, ProjectRole } from '@pm/shared';
import { PersonAddRegular } from '@/components/icons';
import { AddMemberPanel } from '@/components/features/projects/AddMemberPanel';
import { MemberTile } from '@/components/features/projects/MemberTile';
import { useProjectContext } from '@/components/features/projects/ProjectContext';
import { AppBar } from '@/components/metro/AppBar';
import { ConfirmBand } from '@/components/metro/ConfirmBand';
import { ErrorState, SkeletonTiles } from '@/components/metro/States';
import { Panorama, TileGroup } from '@/components/metro/Tile';
import { ApiError } from '@/lib/api/client';
import { useChangeMemberRole, useMembers, useRemoveMember } from '@/lib/api/queries/projects';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { firstName, plural, projectRoleLabel } from '@/lib/format';
import { canInProject } from '@/lib/permissions';

type Pending =
  | { kind: 'remove'; member: ProjectMember }
  | { kind: 'role'; member: ProjectMember; role: ProjectRole }
  | null;

/** Team: people grouped by role, with role changes and removal (UI_REQUIREMENTS §3.7). */
export default function TeamPage() {
  const project = useProjectContext();
  const user = useCurrentUser();
  const members = useMembers(project.id);
  const changeRole = useChangeMemberRole(project.id);
  const remove = useRemoveMember(project.id);
  const [pending, setPending] = useState<Pending>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const canAdd = canInProject(user, project, 'member.add', { role: 'MEMBER' });
  const isAdmin = user.role === 'ADMIN';

  const applyRole = async (member: ProjectMember, role: ProjectRole) => {
    try {
      await changeRole.mutateAsync({ userId: member.user.id, role });
      toast.success(`${member.user.name} is now ${projectRoleLabel(role)}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change the role.');
    }
  };

  // Becoming a viewer unassigns open tasks, so that change is confirmed first
  const requestRole = (member: ProjectMember, role: ProjectRole) => {
    if (role === 'VIEWER' && member.openTaskCount > 0) setPending({ kind: 'role', member, role });
    else void applyRole(member, role);
  };

  if (members.isPending) return <SkeletonTiles count={5} />;
  if (members.isError) return <ErrorState error={members.error} onRetry={() => members.refetch()} />;

  const roster = members.data.data;
  const groups = (['MANAGER', 'MEMBER', 'VIEWER'] as const).map((role) => ({
    role,
    title: `${projectRoleLabel(role)}s · ${roster.filter((m) => m.role === role).length}`,
    people: roster.filter((m) => m.role === role),
  }));

  return (
    <>
      <Panorama>
        {groups.map((group) => (
          <TileGroup
            key={group.role}
            title={group.title}
            footer={
              group.role === 'MANAGER' && canAdd && !isAdmin
                ? 'Only Admins can change Managers.'
                : group.people.length === 0
                  ? `No ${projectRoleLabel(group.role).toLowerCase()}s yet.`
                  : undefined
            }
          >
            {group.people.map((member) => (
              <MemberTile
                key={member.user.id}
                project={project}
                member={member}
                onChangeRole={requestRole}
                onRemove={(m) => setPending({ kind: 'remove', member: m })}
              />
            ))}
          </TileGroup>
        ))}
        {canAdd && <AddMemberPanel ref={searchRef} project={project} />}
      </Panorama>

      {canAdd && (
        <AppBar
          actions={[{ label: 'Add member', icon: <PersonAddRegular />, onClick: () => searchRef.current?.focus() }]}
        />
      )}

      <ConfirmBand
        open={pending?.kind === 'remove'}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.kind === 'remove' ? `Remove ${firstName(pending.member.user.name)} from this project?` : ''}
        tone="danger"
        confirmLabel="Remove member"
        onConfirm={async () => {
          if (pending?.kind !== 'remove') return;
          await remove.mutateAsync(pending.member.user.id);
          toast.success(`${pending.member.user.name} removed`);
        }}
      >
        {pending?.kind === 'remove' && (
          <p>
            {pending.member.openTaskCount > 0
              ? `${plural(pending.member.openTaskCount, 'open task')} will become unassigned. `
              : ''}
            Comments and activity stay in the project.
          </p>
        )}
      </ConfirmBand>

      <ConfirmBand
        open={pending?.kind === 'role'}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.kind === 'role' ? `Change ${firstName(pending.member.user.name)} to Viewer?` : ''}
        confirmLabel="Change to Viewer"
        onConfirm={async () => {
          if (pending?.kind !== 'role') return;
          await changeRole.mutateAsync({ userId: pending.member.user.id, role: pending.role });
          toast.success(`${pending.member.user.name} is now a Viewer`);
        }}
      >
        {pending?.kind === 'role' && (
          <p>
            {firstName(pending.member.user.name)} becomes read-only. Their{' '}
            {plural(pending.member.openTaskCount, 'open task')} will become unassigned.
          </p>
        )}
      </ConfirmBand>
    </>
  );
}
