'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PROJECT_SORTS, type Project } from '@pm/shared';
import { AddRegular, BoardRegular, TextBulletListLtrRegular } from '@/components/icons';
import { CreateProjectPane } from '@/components/features/projects/CreateProjectPane';
import { ProjectTable } from '@/components/features/projects/ProjectTable';
import { ProjectTile } from '@/components/features/projects/ProjectTile';
import { AppBar, type AppBarAction } from '@/components/metro/AppBar';
import { MenuButton } from '@/components/metro/MenuButton';
import { EmptyState, ErrorState, SkeletonTiles } from '@/components/metro/States';
import { TileFlipProvider } from '@/components/metro/Tile';
import { useProjects } from '@/lib/api/queries/projects';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { plural } from '@/lib/format';
import { canInSystem } from '@/lib/permissions';
import { btn, inputClass } from '@/lib/ui';
import { useDebounced } from '@/lib/useDebounced';

type Status = 'ACTIVE' | 'ARCHIVED' | 'ALL';
type Sort = (typeof PROJECT_SORTS)[number];

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: '-updatedAt', label: 'Updated ↓' },
  { value: 'name', label: 'Name A–Z' },
  { value: '-name', label: 'Name Z–A' },
  { value: '-createdAt', label: 'Newest' },
  { value: 'createdAt', label: 'Oldest' },
];

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsHub />
    </Suspense>
  );
}

function ProjectsHub() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);

  // Filters live in the URL so the view can be shared and survives the back button
  const status = (params.get('status') as Status | null) ?? 'ACTIVE';
  const sort = (params.get('sort') as Sort | null) ?? '-updatedAt';
  const view = params.get('view') === 'list' ? 'list' : 'tiles';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search.trim(), 300);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const query = useProjects({ status, sort, search: debouncedSearch || undefined, pageSize: 12 });
  const projects = query.data?.pages.flatMap((p) => p.data) ?? [];
  const meta = query.data?.pages[0]?.meta;
  const canCreate = canInSystem(user, 'project.create');

  const actions: AppBarAction[] = [
    ...(canCreate ? [{ label: 'New project', icon: <AddRegular />, onClick: () => setCreating(true) }] : []),
    view === 'tiles'
      ? { label: 'List', icon: <TextBulletListLtrRegular />, onClick: () => setParam('view', 'list') }
      : { label: 'Tiles', icon: <BoardRegular />, onClick: () => setParam('view', null) },
  ];

  const groups: { title: string; items: Project[] }[] =
    status === 'ALL'
      ? [
          { title: 'Active', items: projects.filter((p) => p.status === 'ACTIVE') },
          { title: 'Archived', items: projects.filter((p) => p.status === 'ARCHIVED') },
        ].filter((g) => g.items.length > 0)
      : [{ title: status === 'ACTIVE' ? 'Active' : 'Archived', items: projects }];

  return (
    <main className="px-4 pt-6 sm:px-16">
      <h1 className="text-5xl font-light sm:text-7xl">Projects</h1>
      {meta && (
        <p className="mt-3 text-muted">
          {meta.statusCounts.ACTIVE} active · {meta.statusCounts.ARCHIVED} archived
        </p>
      )}

      <div className="mt-8 mb-8 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="project-search">
          Search projects
        </label>
        <input
          id="project-search"
          type="search"
          placeholder="Search projects"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setParam('q', e.target.value || null);
          }}
          className={`${inputClass()} h-11 w-full sm:w-72`}
        />
        <MenuButton<Status>
          label="Status"
          value={status}
          onChange={(v) => setParam('status', v === 'ACTIVE' ? null : v)}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'ARCHIVED', label: 'Archived' },
            { value: 'ALL', label: 'All' },
          ]}
        />
        <MenuButton<Sort> label="Sort" value={sort} onChange={(v) => setParam('sort', v === '-updatedAt' ? null : v)} options={SORT_OPTIONS} />
      </div>

      {query.isPending ? (
        <SkeletonTiles count={4} wide />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : projects.length === 0 ? (
        <EmptyState
          title={debouncedSearch ? 'No projects match your search' : status === 'ARCHIVED' ? 'No archived projects' : 'No projects yet'}
          message={
            debouncedSearch || status === 'ARCHIVED'
              ? undefined
              : canCreate
                ? 'Create the first project and assign its managers.'
                : "You're not in any projects yet. A project manager will add you."
          }
          action={
            canCreate && !debouncedSearch && status !== 'ARCHIVED' ? (
              <button className={btn.primary} onClick={() => setCreating(true)}>
                New project
              </button>
            ) : undefined
          }
        />
      ) : view === 'list' ? (
        <ProjectTable projects={projects} />
      ) : (
        <TileFlipProvider>
          <div className="flex flex-col gap-10">
            {groups.map((group) => (
              <section key={group.title}>
                <h2 className="mb-4 text-2xl font-light sm:text-[28px]">{group.title}</h2>
                <div className="tile-grid lg:tile-grid-8">
                  {group.items.map((project) => (
                    <ProjectTile key={project.id} project={project} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </TileFlipProvider>
      )}

      {query.hasNextPage && (
        <div className="mt-6 flex items-center gap-6">
          <button className={btn.secondary} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
          <span className="text-sm text-muted">
            {plural(projects.length, 'project')} of {meta?.total}
          </span>
        </div>
      )}

      <AppBar actions={actions} />
      {canCreate && <CreateProjectPane open={creating} onOpenChange={setCreating} />}
    </main>
  );
}
