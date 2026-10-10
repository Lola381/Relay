'use client';

import { createContext, useContext } from 'react';
import type { Project } from '@pm/shared';

/** The project being viewed, loaded once by /projects/[id]/layout and shared with its tabs. */
export const ProjectContext = createContext<Project | null>(null);

export function useProjectContext(): Project {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('useProjectContext must be used under /projects/[id]');
  return project;
}
