// Human-readable text for notifications and activity entries, rendered from type + metadata
// snapshots (so entries still read correctly after renames and deletes).
import type { ActivityEntry, Notification } from '@pm/shared';
import { STATUS_LABELS } from './format';

const str = (value: unknown, fallback = '') => (typeof value === 'string' && value ? value : fallback);
const statusLabel = (value: unknown) =>
  typeof value === 'string' && value in STATUS_LABELS ? STATUS_LABELS[value as keyof typeof STATUS_LABELS] : str(value);

export function notificationText(n: Pick<Notification, 'type' | 'metadata' | 'actor'>): string {
  const m = n.metadata;
  const who = n.actor?.name ?? str(m.actorName, 'Someone');
  const task = `"${str(m.taskTitle, 'a task')}"`;
  const project = str(m.projectName, 'a project');
  switch (n.type) {
    case 'TASK_ASSIGNED':
      return `${who} assigned you ${task}`;
    case 'TASK_UNASSIGNED':
      return `${who} unassigned you from ${task}`;
    case 'TASK_STATUS_CHANGED':
      return `${who} moved ${task} to ${statusLabel(m.to)}`;
    case 'TASK_UPDATED':
      return `${who} updated ${task}`;
    case 'COMMENT_ADDED':
      return `${who} commented on ${task}`;
    case 'MENTIONED':
      return `${who} mentioned you on ${task}`;
    case 'PROJECT_MEMBER_ADDED':
      return `${who} added you to ${project}`;
    case 'PROJECT_MEMBER_REMOVED':
      return `${who} removed you from ${project}`;
    case 'PROJECT_ROLE_CHANGED':
      return `${who} changed your role in ${project}`;
    default:
      return `${who} made a change`;
  }
}

export function activityText(a: Pick<ActivityEntry, 'action' | 'metadata' | 'actor'>): string {
  const m = a.metadata;
  const who = a.actor?.name ?? 'System';
  const task = `"${str(m.taskTitle, 'a task')}"`;
  const project = str(m.projectName, 'the project');
  const person = str(m.memberName, str(m.userName, str(m.assigneeName, 'someone')));
  switch (a.action) {
    case 'PROJECT_CREATED':
      return `${who} created ${project}`;
    case 'PROJECT_UPDATED':
      return `${who} edited the project details`;
    case 'PROJECT_ARCHIVED':
      return `${who} archived the project`;
    case 'PROJECT_UNARCHIVED':
      return `${who} unarchived the project`;
    case 'PROJECT_DELETED':
      return `${who} deleted ${project}`;
    case 'MEMBER_ADDED':
      return `${who} added ${person}`;
    case 'MEMBER_REMOVED':
      return `${who} removed ${person}`;
    case 'MEMBER_ROLE_CHANGED':
      return `${who} changed ${person}'s role`;
    case 'TASK_CREATED':
      return `${who} created ${task}`;
    case 'TASK_UPDATED':
      return m.changes && typeof m.changes === 'object' && Object.keys(m.changes).length
        ? `${who} changed the ${Object.keys(m.changes).join(', ')} of ${task}`
        : `${who} updated ${task}`;
    case 'TASK_ASSIGNED':
      return `${who} assigned ${task} to ${person}`;
    case 'TASK_UNASSIGNED':
      return `${who} unassigned ${task}`;
    case 'TASK_STATUS_CHANGED':
      return m.from
        ? `${who} moved ${task} from ${statusLabel(m.from)} to ${statusLabel(m.to)}`
        : `${who} moved ${task} to ${statusLabel(m.to)}`;
    case 'TASK_DELETED':
      return `${who} deleted ${task}`;
    case 'COMMENT_ADDED':
      return `${who} commented on ${task}`;
    case 'COMMENT_DELETED':
      return `${who} deleted a comment on ${task}`;
    case 'USER_CREATED':
      return `${who} created the account for ${person}`;
    case 'USER_UPDATED':
      return `${who} updated ${person}`;
    case 'USER_DEACTIVATED':
      return `${who} deactivated ${person}`;
    case 'USER_ACTIVATED':
      return `${who} reactivated ${person}`;
    default:
      return `${who} made a change`;
  }
}

/** "@[Name](id)" tokens → "@Name" for plain display. */
export const plainMentions = (body: string) => body.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
