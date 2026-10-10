import Link from 'next/link';
import type { Project } from '@pm/shared';
import { WarningRegular } from '@/components/icons';
import { projectProgress, projectRoleLabel, shortDate } from '@/lib/format';

/** List view alternative to the tiles (denser, easier with a screen reader). */
export function ProjectTable({ projects }: { projects: Project[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
        <thead className="bg-accent/10">
          <tr>
            {['Name', 'Your role', 'Progress', 'Members', 'Updated'].map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const { done, total, percent } = projectProgress(project);
            return (
              <tr key={project.id} className="border-b border-border-subtle">
                <td className="px-4 py-4">
                  <Link href={`/projects/${project.id}`} className="text-accent-text hover:underline">
                    {project.name}
                  </Link>
                  {project.managers.length === 0 && (
                    <WarningRegular aria-label="No manager assigned" className="ml-2 inline text-warning" />
                  )}
                  {project.status === 'ARCHIVED' && <span className="ml-2 text-sm text-muted">Archived</span>}
                </td>
                <td className="px-4 py-4">{projectRoleLabel(project.myRole)}</td>
                <td className="px-4 py-4">
                  {done} / {total} · {percent}%
                </td>
                <td className="px-4 py-4">{project.stats.memberCount}</td>
                <td className="px-4 py-4">{shortDate(project.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
