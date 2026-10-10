'use client';

import { useParams } from 'next/navigation';
import { ProjectContext } from '@/components/features/projects/ProjectContext';
import { Pivot } from '@/components/metro/Pivot';
import { Banner, ErrorState, LoadingState } from '@/components/metro/States';
import { useProject } from '@/lib/api/queries/projects';
import { longDate, plural, projectRoleLabel } from '@/lib/format';

/** Project hub shell: title, role, archived banner and the pivot across Overview / Team. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const query = useProject(id);

  if (query.isPending) {
    return (
      <main className="px-4 pt-6 sm:px-16">
        <LoadingState label="Loading project" />
      </main>
    );
  }
  if (query.isError) {
    return (
      <main className="px-4 pt-6 sm:px-16">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </main>
    );
  }

  const project = query.data;
  const archived = project.status === 'ARCHIVED';
  const base = `/projects/${project.id}`;

  return (
    <ProjectContext.Provider value={project}>
      {archived && <Banner>Archived project · Tasks, comments and members are read-only.</Banner>}
      <main className="px-4 pt-6 sm:px-16">
        <h1 className="text-5xl font-light break-words sm:text-7xl">{project.name}</h1>
        <p className="mt-3 text-muted">
          {projectRoleLabel(project.myRole)}
          {' · '}
          {archived && project.archivedAt
            ? `Archived ${longDate(project.archivedAt)}`
            : plural(project.stats.memberCount, 'person', 'people')}
          {project.myRole === 'VIEWER' && ' · Read-only access'}
        </p>
        <div className="mt-5 mb-8">
          <Pivot
            items={[
              { href: base, label: 'Overview', exact: true },
              { href: `${base}/tasks`, label: 'Tasks' },
              { href: `${base}/team`, label: 'Team' },
            ]}
          />
        </div>
        {children}
      </main>
    </ProjectContext.Provider>
  );
}
