'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddMemberInput,
  ApiResponse,
  CreateProjectInput,
  ListProjectsQuery,
  ListUsersQuery,
  Paginated,
  Project,
  ProjectMember,
  ProjectRole,
  ProjectStatus,
  UpdateProjectInput,
  UserSummary,
} from '@pm/shared';
import { api } from '../client';

export const queryKeys = {
  projects: ['projects'] as const,
  projectList: (params: object) => ['projects', 'list', params] as const,
  project: (id: string) => ['projects', 'detail', id] as const,
  members: (projectId: string) => ['projects', 'detail', projectId, 'members'] as const,
  users: (params: object) => ['users', params] as const,
};

const toQuery = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

type ProjectPage = Paginated<Project> & { meta: { statusCounts: Record<ProjectStatus, number> } };

/** Paged project list with "Load more". */
export function useProjects(params: Omit<ListProjectsQuery, 'page'>) {
  return useInfiniteQuery({
    queryKey: queryKeys.projectList(params),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<ProjectPage>(`/projects${toQuery({ ...params, page: pageParam })}`, { signal }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: ({ signal }) => api<ApiResponse<Project>>(`/projects/${id}`, { signal }).then((r) => r.data),
  });
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: ({ signal }) => api<Paginated<ProjectMember>>(`/projects/${projectId}/members`, { signal }),
  });
}

export function useUserSearch(params: ListUsersQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: ({ signal }) => api<Paginated<UserSummary>>(`/users${toQuery(params)}`, { signal }),
    enabled,
    staleTime: 10_000,
  });
}

// ── Mutations: each refreshes what it changed ──

function useProjectMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectId ? queryKeys.project(projectId) : queryKeys.projects });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export const useCreateProject = () =>
  useProjectMutation((input: CreateProjectInput) =>
    api<ApiResponse<Project>>('/projects', { method: 'POST', body: input }).then((r) => r.data),
  );

export const useUpdateProject = (id: string) =>
  useProjectMutation(
    (input: UpdateProjectInput) =>
      api<ApiResponse<Project>>(`/projects/${id}`, { method: 'PATCH', body: input }).then((r) => r.data),
    id,
  );

export const useSetArchived = (id: string) =>
  useProjectMutation(
    (archive: boolean) =>
      api<ApiResponse<Project>>(`/projects/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }).then(
        (r) => r.data,
      ),
    id,
  );

export function useDeleteProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.project(id) });
      return queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export const useAddMember = (projectId: string) =>
  useProjectMutation(
    (input: AddMemberInput) =>
      api<ApiResponse<ProjectMember>>(`/projects/${projectId}/members`, { method: 'POST', body: input }),
    projectId,
  );

export const useChangeMemberRole = (projectId: string) =>
  useProjectMutation(
    ({ userId, role }: { userId: string; role: ProjectRole }) =>
      api<ApiResponse<ProjectMember>>(`/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: { role } }),
    projectId,
  );

export const useRemoveMember = (projectId: string) =>
  useProjectMutation(
    (userId: string) => api<void>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    projectId,
  );
