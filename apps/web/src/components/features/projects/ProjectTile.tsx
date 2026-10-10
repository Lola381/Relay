'use client';

import Link from 'next/link';
import { TASK_STATUSES, type Project } from '@pm/shared';
import { FolderRegular, WarningRegular } from '@/components/icons';
import { Tile, TileActions } from '@/components/metro/Tile';
import { longDate, plural, projectProgress, projectRoleLabel, STATUS_LABELS } from '@/lib/format';

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div aria-hidden className="mt-3 h-[3px] bg-white/30">
      <div className="h-full bg-white" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Wide project tile (UI_REQUIREMENTS §3.2/§3.3): summary on the front, breakdown + links on the back. */
export function ProjectTile({ project }: { project: Project }) {
  const { done, total, percent } = projectProgress(project);
  const archived = project.status === 'ARCHIVED';
  const noManager = project.managers.length === 0;
  const href = `/projects/${project.id}`;

  const front = (
    <>
      <div className="flex items-start justify-between gap-3 text-sm">
        <FolderRegular aria-hidden fontSize={24} />
        <span>
          {projectRoleLabel(project.myRole)} · {plural(project.stats.memberCount, 'person', 'people')}
        </span>
      </div>
      <p className="mt-2 truncate text-[26px] leading-tight font-light sm:text-[28px]">{project.name}</p>
      <p className="mt-1 text-sm">
        {done} / {total} done · {percent}%
      </p>
      <ProgressBar percent={percent} />
      <p className="mt-auto truncate text-sm">
        {archived ? (
          `Archived ${project.archivedAt ? longDate(project.archivedAt) : ''} · Read-only`
        ) : noManager ? (
          <span className="inline-flex items-center gap-1.5">
            <WarningRegular aria-hidden /> No manager assigned
          </span>
        ) : (
          (project.description ?? `Managed by ${project.managers.map((m) => m.name).join(', ')}`)
        )}
      </p>
    </>
  );

  const back = (
    <>
      <p className="pr-8 text-xl font-light">{project.name}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
        {TASK_STATUSES.map((status) => (
          <div key={status} className="flex justify-between gap-2">
            <dt>{STATUS_LABELS[status]}</dt>
            <dd>{project.stats.taskCounts[status]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm">
        {project.stats.overdueCount} overdue · {project.stats.unassignedCount} unassigned
      </p>
      <p className="truncate text-sm">
        {noManager ? 'No manager assigned' : `Managers · ${project.managers.map((m) => m.name).join(', ')}`}
      </p>
      <TileActions>
        <Link href={href}>Open</Link>
        <Link href={`${href}/team`}>Team</Link>
      </TileActions>
    </>
  );

  return (
    <Tile
      size="wide"
      tone="project"
      label={`${project.name}, ${percent}% done${archived ? ', archived' : ''}`}
      front={front}
      back={back}
      dimmed={archived}
    />
  );
}
