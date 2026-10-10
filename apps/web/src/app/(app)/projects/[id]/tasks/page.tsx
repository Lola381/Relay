'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ERROR_CODES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ApiResponse,
  type Paginated,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@pm/shared';
import { AddRegular, DeleteRegular } from '@/components/icons';
import { useProjectContext } from '@/components/features/projects/ProjectContext';
import { TaskDetailPane } from '@/components/features/tasks/TaskDetailPane';
import { AppBar } from '@/components/metro/AppBar';
import { ConfirmBand } from '@/components/metro/ConfirmBand';
import { SidePane } from '@/components/metro/SidePane';
import { ErrorState, SkeletonTiles } from '@/components/metro/States';
import { api, ApiError } from '@/lib/api/client';
import { useMembers } from '@/lib/api/queries/projects';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { STATUS_LABELS } from '@/lib/format';
import { canInProject } from '@/lib/permissions';
import { btn, inputClass } from '@/lib/ui';

type Conflict = { task: Task; wanted: TaskStatus; latest: Task; message: string };

/** Task board: one column per status (UI_REQUIREMENTS §3.5). */
export default function TaskBoardPage() {
  const project = useProjectContext();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const key = ['projects', 'detail', project.id, 'tasks'];
  const tasks = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<Paginated<Task>>(`/projects/${project.id}/tasks?pageSize=200&sort=-updatedAt`, { signal }),
  });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Task | null>(null);
  // ?task=<id> opens the detail pane (links from notifications land here)
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openTaskId = searchParams.get('task');
  const openTask = (id: string | null) => router.replace(id ? `${pathname}?task=${id}` : pathname, { scroll: false });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'detail', project.id], exact: true });
  };

  const move = useMutation({
    mutationFn: ({ task, status, version }: { task: Task; status: TaskStatus; version: number }) =>
      api<ApiResponse<Task>>(`/tasks/${task.id}/status`, { method: 'PATCH', body: { version, status } }),
    // Optimistic: move the card now, roll back if the server says no
    onMutate: async ({ task, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Paginated<Task>>(key);
      queryClient.setQueryData<Paginated<Task>>(key, (old) =>
        old ? { ...old, data: old.data.map((t) => (t.id === task.id ? { ...t, status } : t)) } : old,
      );
      return { previous };
    },
    onError: (err, { task, status }, context) => {
      queryClient.setQueryData(key, context?.previous);
      if (err instanceof ApiError && err.code === ERROR_CODES.VERSION_CONFLICT) {
        const latest = (err.details as { current: Task }).current;
        setConflict({ task, wanted: status, latest, message: err.message });
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Could not move the task.');
      }
    },
    onSettled: refresh,
  });

  const canCreate = canInProject(user, project, 'task.create');
  const canDelete = canInProject(user, project, 'task.delete');

  if (tasks.isPending) return <SkeletonTiles count={4} />;
  if (tasks.isError) return <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />;

  return (
    <>
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const column = tasks.data.data.filter((t) => t.status === status);
          return (
            <section key={status} aria-label={STATUS_LABELS[status]}>
              <h2 className="mb-4 text-2xl font-light">
                {STATUS_LABELS[status]} · {column.length}
              </h2>
              <ul className="space-y-3">
                {column.map((task) => {
                  const canMove = canInProject(user, project, 'task.changeStatus', {
                    assigneeId: task.assignee?.id ?? null,
                  });
                  return (
                    <li key={task.id} className="flex min-h-[204px] flex-col bg-tile-work p-4 text-white">
                      <p className="text-xs tracking-wide uppercase">{task.priority}</p>
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        className="mt-2 text-left text-[22px] leading-tight font-light hover:underline"
                      >
                        {task.title}
                      </button>
                      <p className="mt-2 text-sm">
                        {task.assignee ? task.assignee.name : 'Unassigned'}
                        {task.assignee?.id === user.id && ' · Mine'}
                        {task.assignee && !task.assignee.isActive && ' · deactivated'}
                      </p>
                      <p className="text-sm">
                        {task.dueDate ?? 'No due date'}
                        {task.isOverdue && ' · overdue'}
                        {task.commentCount > 0 && ` · ${task.commentCount} comment${task.commentCount === 1 ? '' : 's'}`}
                      </p>
                      <div className="mt-auto flex items-center gap-2 pt-3">
                        <label className="sr-only" htmlFor={`status-${task.id}`}>
                          Status of {task.title}
                        </label>
                        <select
                          id={`status-${task.id}`}
                          value={task.status}
                          disabled={!canMove || move.isPending}
                          onChange={(e) =>
                            move.mutate({ task, status: e.target.value as TaskStatus, version: task.version })
                          }
                          className="flex-1 border border-white/70 bg-transparent px-2 py-1 text-sm disabled:opacity-60 [&>option]:text-black"
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        {canDelete && (
                          <button
                            type="button"
                            aria-label={`Delete ${task.title}`}
                            onClick={() => setDeleting(task)}
                            className="p-1 hover:bg-white/15"
                          >
                            <DeleteRegular fontSize={18} aria-hidden />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {column.length === 0 && <li className="text-sm text-muted">Nothing here.</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {canCreate && <AppBar actions={[{ label: 'New task', icon: <AddRegular />, onClick: () => setCreating(true) }]} />}
      {canCreate && <CreateTaskPane open={creating} onOpenChange={setCreating} onCreated={refresh} />}

      <TaskDetailPane taskId={openTaskId} onClose={() => openTask(null)} />

      <ConfirmBand
        open={conflict !== null}
        onOpenChange={(open) => !open && setConflict(null)}
        title={conflict?.message.replace('while you were editing', 'while you moved it') ?? ''}
        confirmLabel="Move anyway"
        onConfirm={async () => {
          if (!conflict) return;
          await move.mutateAsync({ task: conflict.latest, status: conflict.wanted, version: conflict.latest.version });
        }}
      >
        {conflict && (
          <p>
            Current: {STATUS_LABELS[conflict.latest.status]} · Your move: {STATUS_LABELS[conflict.wanted]}
          </p>
        )}
      </ConfirmBand>

      <ConfirmBand
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.title ?? ''}"?`}
        tone="danger"
        confirmLabel="Delete task"
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/tasks/${deleting.id}`, { method: 'DELETE' });
          toast.success('Task deleted');
          refresh();
        }}
      >
        <p>Its comments will be deleted too. This cannot be undone.</p>
      </ConfirmBand>
    </>
  );
}

function CreateTaskPane({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const project = useProjectContext();
  const members = useMembers(project.id);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const assignable = (members.data?.data ?? []).filter((m) => m.role !== 'VIEWER' && m.user.isActive);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/projects/${project.id}/tasks`, {
        method: 'POST',
        body: { title, priority, assigneeId: assigneeId || null, dueDate: dueDate || null },
      });
      toast.success('Task created');
      setTitle('');
      setAssigneeId('');
      setDueDate('');
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the task.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePane open={open} onOpenChange={onOpenChange} title="New task" dirty={title.length > 0}>
      <form onSubmit={submit} className="space-y-5">
        {error && <p className="text-danger" role="alert">{error}</p>}
        <label className="block">
          <span className="mb-1.5 block">Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus className={inputClass()} />
        </label>
        <label className="block">
          <span className="mb-1.5 block">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputClass()}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block">Assignee</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass()}>
            <option value="">Unassigned</option>
            {assignable.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block">Due date</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass()} />
        </label>
        <button type="submit" className={btn.primary} disabled={busy || !title.trim()}>
          {busy ? 'Creating…' : 'Create task'}
        </button>
      </form>
    </SidePane>
  );
}
