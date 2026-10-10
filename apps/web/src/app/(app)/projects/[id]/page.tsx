'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TASK_STATUSES } from '@pm/shared';
import {
  ArchiveArrowBackRegular,
  ArchiveRegular,
  ClockRegular,
  DataBarVerticalRegular,
  DeleteRegular,
  EditRegular,
  InfoRegular,
  PeopleRegular,
  PersonDeleteRegular,
  TaskListLtrRegular,
} from '@/components/icons';
import { EditProjectPane } from '@/components/features/projects/EditProjectPane';
import { useProjectContext } from '@/components/features/projects/ProjectContext';
import { AppBar, type AppBarAction } from '@/components/metro/AppBar';
import { ConfirmBand } from '@/components/metro/ConfirmBand';
import { Panorama, Tile, TileActions, TileGroup } from '@/components/metro/Tile';
import { useDeleteProject, useMembers, useSetArchived } from '@/lib/api/queries/projects';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { initials, longDate, plural, projectProgress, shortDate, STATUS_LABELS } from '@/lib/format';
import { canInProject, canInSystem } from '@/lib/permissions';
import { btn, inputClass } from '@/lib/ui';

/** Project overview tiles (UI_REQUIREMENTS §3.4). */
export default function ProjectOverviewPage() {
  const project = useProjectContext();
  const user = useCurrentUser();
  const router = useRouter();
  const members = useMembers(project.id);
  const setArchived = useSetArchived(project.id);
  const deleteProject = useDeleteProject(project.id);

  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typedName, setTypedName] = useState('');

  const { done, total, percent } = projectProgress(project);
  const archived = project.status === 'ARCHIVED';
  const canEdit = canInProject(user, project, 'project.update');
  const canArchive = canInSystem(user, 'project.archive');
  const canDelete = canInSystem(user, 'project.delete');

  const roster = members.data?.data ?? [];
  const byRole = {
    MANAGER: roster.filter((m) => m.role === 'MANAGER').length,
    MEMBER: roster.filter((m) => m.role === 'MEMBER').length,
    VIEWER: roster.filter((m) => m.role === 'VIEWER').length,
  };

  const actions: AppBarAction[] = [
    ...(canEdit ? [{ label: 'Edit', icon: <EditRegular />, onClick: () => setEditing(true) }] : []),
    ...(canArchive
      ? [
          archived
            ? { label: 'Unarchive', icon: <ArchiveArrowBackRegular />, onClick: () => setArchiveOpen(true) }
            : { label: 'Archive', icon: <ArchiveRegular />, onClick: () => setArchiveOpen(true) },
        ]
      : []),
    ...(canDelete ? [{ label: 'Delete', icon: <DeleteRegular />, onClick: () => setDeleteOpen(true) }] : []),
  ];

  return (
    <>
      {archived && canArchive && (
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <button className={btn.primary} onClick={() => setArchiveOpen(true)}>
            Unarchive project
          </button>
          <span className="text-muted">Restore editing for the project team.</span>
        </div>
      )}

      <Panorama>
        <TileGroup title="Progress">
          <Tile
            size="large"
            tone="project"
            label={`${percent}% of tasks complete`}
            front={
              <>
                <DataBarVerticalRegular aria-hidden fontSize={26} />
                <p className="mt-auto text-7xl font-light sm:text-[88px]">{percent}%</p>
                <p className="mt-2 text-2xl font-light">Tasks complete</p>
                <p className="mt-1 text-sm">
                  {done} / {total} done
                </p>
                <div aria-hidden className="mt-3 h-[3px] bg-white/30">
                  <div className="h-full bg-white" style={{ width: `${percent}%` }} />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-[15px]">
                  {TASK_STATUSES.map((s) => (
                    <div key={s} className="flex justify-between">
                      <dt>{STATUS_LABELS[s]}</dt>
                      <dd>{project.stats.taskCounts[s]}</dd>
                    </div>
                  ))}
                </dl>
              </>
            }
          />
        </TileGroup>

        <TileGroup title="People & priorities">
          <Tile
            size="medium"
            tone="alert"
            label={`${project.stats.overdueCount} overdue tasks`}
            front={
              <>
                <ClockRegular aria-hidden fontSize={26} />
                <p className="mt-auto text-5xl font-light">{project.stats.overdueCount}</p>
                <p className="mt-1 text-xl font-light">Overdue</p>
              </>
            }
          />
          <Tile
            size="medium"
            tone="work"
            label={`${project.stats.unassignedCount} unassigned open tasks`}
            front={
              <>
                <PersonDeleteRegular aria-hidden fontSize={26} />
                <p className="mt-auto text-5xl font-light">{project.stats.unassignedCount}</p>
                <p className="mt-1 text-xl font-light">Unassigned</p>
              </>
            }
          />
          <Tile
            size="wide"
            tone="user"
            label={`Team: ${plural(project.stats.memberCount, 'person', 'people')}`}
            href={`/projects/${project.id}/team`}
            front={
              <>
                <PeopleRegular aria-hidden fontSize={26} />
                <p className="mt-auto text-2xl font-light">Team</p>
                <p className="mt-1 text-sm">
                  {plural(byRole.MANAGER, 'Manager')} · {plural(byRole.MEMBER, 'Member')} · {plural(byRole.VIEWER, 'Viewer')}
                </p>
                <p className="mt-3 flex gap-4 text-sm" aria-hidden>
                  {roster.slice(0, 6).map((m) => (
                    <span key={m.user.id}>{initials(m.user.name)}</span>
                  ))}
                  {roster.length > 6 && <span>+{roster.length - 6}</span>}
                </p>
              </>
            }
          />
        </TileGroup>

        <TileGroup
          title="In this project"
          footer={archived ? 'No tasks can be created, moved or deleted.' : undefined}
        >
          <Tile
            size="medium"
            tone="work"
            label={`${project.stats.myOpenTaskCount} of my open tasks here`}
            front={
              <>
                <TaskListLtrRegular aria-hidden fontSize={26} />
                <p className="mt-auto text-5xl font-light">{project.stats.myOpenTaskCount}</p>
                <p className="mt-1 text-xl font-light">My tasks here</p>
              </>
            }
          />
          <Tile
            size="wide"
            tone="stat"
            label="About this project"
            front={
              <>
                <InfoRegular aria-hidden fontSize={26} />
                <p className="mt-auto text-2xl font-light">About</p>
                <p className="mt-1 line-clamp-2 text-sm">{project.description ?? 'No description yet.'}</p>
                <p className="mt-1 text-sm">
                  Created {longDate(project.createdAt)} by {project.createdBy.name} · Updated {shortDate(project.updatedAt)}
                </p>
              </>
            }
            back={
              <>
                <p className="pr-8 text-xl font-light">About</p>
                <p className="mt-2 line-clamp-4 overflow-y-auto text-sm whitespace-pre-line">
                  {project.description ?? 'No description yet.'}
                </p>
                <TileActions>
                  {canEdit && (
                    <button type="button" onClick={() => setEditing(true)}>
                      Edit
                    </button>
                  )}
                  <Link href={`/projects/${project.id}/team`}>Team</Link>
                </TileActions>
              </>
            }
          />
        </TileGroup>
      </Panorama>

      <AppBar actions={actions} />

      {canEdit && <EditProjectPane project={project} open={editing} onOpenChange={setEditing} />}

      <ConfirmBand
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={archived ? `Unarchive ${project.name}?` : `Archive ${project.name}?`}
        confirmLabel={archived ? 'Unarchive project' : 'Archive project'}
        onConfirm={async () => {
          await setArchived.mutateAsync(!archived);
          toast.success(archived ? 'Project unarchived' : 'Project archived');
        }}
      >
        <p>
          {archived
            ? 'Editing is restored for the project team.'
            : "Everyone keeps read access, but tasks, comments and members can't be changed until an admin unarchives it."}
        </p>
      </ConfirmBand>

      <ConfirmBand
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next);
          if (!next) setTypedName('');
        }}
        title={`Delete ${project.name}?`}
        tone="danger"
        confirmLabel="Delete project"
        confirmDisabled={typedName !== project.name}
        onConfirm={async () => {
          await deleteProject.mutateAsync();
          toast.success(`Deleted ${project.name}`);
          router.replace('/projects');
        }}
      >
        <p className="text-lg">
          {plural(project.stats.taskCount, 'task')} and {plural(project.stats.commentCount, 'comment')} will be
          permanently deleted.
        </p>
        <p className="text-muted">This cannot be undone. Activity keeps a deleted-project reference.</p>
        <label className="block pt-2">
          <span className="mb-1.5 block text-[15px]">Type the project name to confirm *</span>
          <input value={typedName} onChange={(e) => setTypedName(e.target.value)} className={inputClass()} autoComplete="off" />
        </label>
      </ConfirmBand>
    </>
  );
}
