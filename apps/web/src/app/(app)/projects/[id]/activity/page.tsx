'use client';

import { ActivityFeed } from '@/components/features/activity/ActivityFeed';
import { useProjectContext } from '@/components/features/projects/ProjectContext';

/** Project activity log (updates live via SSE). */
export default function ProjectActivityPage() {
  const project = useProjectContext();
  return <ActivityFeed path={`/projects/${project.id}/activity`} queryKey={['projects', 'detail', project.id, 'activity']} />;
}
