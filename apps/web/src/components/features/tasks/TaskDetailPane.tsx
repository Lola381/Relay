'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  ERROR_CODES,
  formatMention,
  TASK_PRIORITIES,
  type ApiResponse,
  type Comment,
  type Paginated,
  type Task,
  type TaskPriority,
} from '@pm/shared';
import { DeleteRegular } from '@/components/icons';
import { useProjectContext } from '@/components/features/projects/ProjectContext';
import { SidePane } from '@/components/metro/SidePane';
import { api, ApiError } from '@/lib/api/client';
import { useMembers } from '@/lib/api/queries/projects';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { STATUS_LABELS } from '@/lib/format';
import { plainMentions } from '@/lib/messages';
import { canInProject } from '@/lib/permissions';
import { btn, inputClass } from '@/lib/ui';

/** Task details + comments with @mentions, in a side pane over the board. */
export function TaskDetailPane({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  return (
    <SidePane open={taskId !== null} onOpenChange={(open) => !open && onClose()} title="Task">
      {taskId && <TaskDetail key={taskId} taskId={taskId} onClose={onClose} />}
    </SidePane>
  );
}

function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const project = useProjectContext();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const members = useMembers(project.id);
  const task = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: ({ signal }) => api<ApiResponse<Task>>(`/tasks/${taskId}`, { signal }).then((r) => r.data),
  });
  const comments = useQuery({
    queryKey: ['tasks', taskId, 'comments'],
    queryFn: ({ signal }) => api<Paginated<Comment>>(`/tasks/${taskId}/comments?pageSize=100`, { signal }),
  });

  const [draft, setDraft] = useState<Partial<Pick<Task, 'title' | 'description' | 'priority' | 'dueDate'>>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [body, setBody] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'detail', project.id] });
  };

  const onWriteError = (err: unknown) => {
    if (err instanceof ApiError && err.code === ERROR_CODES.VERSION_CONFLICT) {
      setConflict(err.message);
      refresh();
    } else if (err instanceof ApiError && err.code === ERROR_CODES.TASK_DELETED) {
      toast.error('This task has been deleted.');
      onClose();
    } else {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.');
    }
  };

  const save = useMutation({
    mutationFn: (version: number) => api(`/tasks/${taskId}`, { method: 'PATCH', body: { version, ...draft } }),
    onSuccess: () => {
      toast.success('Task saved');
      setDraft({});
      setConflict(null);
      refresh();
    },
    onError: onWriteError,
  });
  const assign = useMutation({
    mutationFn: ({ version, assigneeId }: { version: number; assigneeId: string | null }) =>
      api(`/tasks/${taskId}/assignee`, { method: 'PATCH', body: { version, assigneeId } }),
    onSuccess: refresh,
    onError: onWriteError,
  });
  const postComment = useMutation({
    mutationFn: () => api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not post the comment.'),
  });
  const removeComment = useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete the comment.'),
  });

  if (task.isPending) return <p className="text-muted">Loading…</p>;
  if (task.isError) return <p className="text-danger">{task.error.message}</p>;
  const t = task.data;

  const canDetails = canInProject(user, project, 'task.updateDetails');
  const canDescription = canInProject(user, project, 'task.updateDescription', { assigneeId: t.assignee?.id ?? null });
  const canAssign = canInProject(user, project, 'task.assign');
  const canComment = canInProject(user, project, 'comment.create');
  const roster = members.data?.data ?? [];
  const assignable = roster.filter((m) => m.role !== 'VIEWER' && m.user.isActive);
  const dirty = Object.keys(draft).length > 0;
  const value = <K extends keyof typeof draft>(key: K) => (key in draft ? draft[key] : t[key]);

  return (
    <div className="space-y-6">
      {conflict && (
        <div className="border-l-4 border-warning bg-border-subtle p-3 text-sm" role="alert">
          <p>{conflict}</p>
          <p className="mt-1 text-muted">The latest version is shown below. Your unsaved edits are kept — save again to apply them.</p>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">Title</span>
        <input
          value={value('title') ?? ''}
          disabled={!canDetails}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className={inputClass()}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">Priority</span>
          <select
            value={value('priority') as TaskPriority}
            disabled={!canDetails}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as TaskPriority }))}
            className={inputClass()}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">Due date</span>
          <input
            type="date"
            value={value('dueDate') ?? ''}
            disabled={!canDetails}
            onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value || null }))}
            className={inputClass()}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">Description</span>
        <textarea
          rows={4}
          value={value('description') ?? ''}
          disabled={!canDescription}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className={inputClass()}
        />
      </label>

      {(canDetails || canDescription) && (
        <button className={btn.primary} disabled={!dirty || save.isPending} onClick={() => save.mutate(t.version)}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted">Status</p>
          <p className="text-lg">{STATUS_LABELS[t.status]}</p>
        </div>
        <label className="block">
          <span className="text-muted">Assignee</span>
          <select
            value={t.assignee?.id ?? ''}
            disabled={!canAssign || assign.isPending}
            onChange={(e) => assign.mutate({ version: t.version, assigneeId: e.target.value || null })}
            className={inputClass()}
          >
            <option value="">Unassigned</option>
            {t.assignee && !assignable.some((m) => m.user.id === t.assignee!.id) && (
              <option value={t.assignee.id}>{t.assignee.name}</option>
            )}
            {assignable.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">
        Version {t.version} · last changed by {t.updatedBy.name}{' '}
        {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
      </p>

      <section aria-label="Comments" className="border-t border-border-subtle pt-5">
        <h3 className="mb-3 text-2xl font-light">Comments · {comments.data?.meta.total ?? 0}</h3>
        <ul className="space-y-4">
          {(comments.data?.data ?? []).map((c) => (
            <li key={c.id} className="group">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold">{c.author.name}</span>
                <span className="text-muted">{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
                {canInProject(user, project, 'comment.delete', { authorId: c.author.id }) && (
                  <button
                    aria-label="Delete comment"
                    className="ml-auto p-1 text-muted hover:text-danger"
                    onClick={() => removeComment.mutate(c.id)}
                  >
                    <DeleteRegular fontSize={16} aria-hidden />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">
                {renderBody(c.body)}
              </p>
            </li>
          ))}
          {comments.data?.data.length === 0 && <li className="text-muted">No comments yet.</li>}
        </ul>

        {canComment && (
          <form
            className="mt-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) postComment.mutate();
            }}
          >
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a comment…"
              maxLength={5000}
              className={inputClass()}
              aria-label="Comment"
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                value=""
                aria-label="Mention someone"
                onChange={(e) => {
                  const m = roster.find((r) => r.user.id === e.target.value);
                  if (m) setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}${formatMention(m.user.name, m.user.id)} `);
                }}
                className="border-2 border-border bg-surface px-2 py-2 text-sm"
              >
                <option value="">@ Mention…</option>
                {roster
                  .filter((m) => m.user.id !== user.id)
                  .map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name}
                    </option>
                  ))}
              </select>
              <button type="submit" className={btn.primary} disabled={!body.trim() || postComment.isPending}>
                {postComment.isPending ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

/** Highlights @mentions in a comment body. */
function renderBody(body: string) {
  const parts = body.split(/(@\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) =>
    part.startsWith('@[') ? (
      <span key={i} className="font-semibold text-accent-text">
        {plainMentions(part)}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
