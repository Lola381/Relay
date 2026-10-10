'use client';

import { useQuery } from '@tanstack/react-query';
import type { Paginated, Project, Task } from '@pm/shared';
import { AlertRegular, PeopleRegular, PulseRegular, TaskListLtrRegular } from '@/components/icons';
import { ProjectTile } from '@/components/features/projects/ProjectTile';
import { notificationHref, useNotifications } from '@/components/shell/NotificationBell';
import { Panorama, Tile, TileGroup } from '@/components/metro/Tile';
import { SkeletonTiles } from '@/components/metro/States';
import { api } from '@/lib/api/client';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { firstName, STATUS_LABELS } from '@/lib/format';
import { notificationText } from '@/lib/messages';
import { canInSystem } from '@/lib/permissions';

/** Start screen: live tile groups (UI_REQUIREMENTS §3.1). Refreshes in real time via SSE. */
export default function DashboardPage() {
  const user = useCurrentUser();
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const myTasks = useQuery({
    queryKey: ['me', 'tasks'],
    queryFn: ({ signal }) => api<Paginated<Task>>('/me/tasks?pageSize=8', { signal }),
  });
  const projects = useQuery({
    queryKey: ['projects', 'list', 'start'],
    queryFn: ({ signal }) => api<Paginated<Project>>('/projects?pageSize=4&sort=-updatedAt', { signal }),
  });
  const notifications = useNotifications();
  const isAdmin = canInSystem(user, 'user.manage');
  const latest = notifications.data?.data[0];

  return (
    <main className="px-4 pt-8 pb-16 sm:px-16">
      <h1 className="text-5xl font-light sm:text-7xl">Hello, {firstName(user.name)}</h1>
      <p className="mt-4 mb-10 text-muted">{today}</p>

      <Panorama>
        <TileGroup title="My work" footer={myTasks.data && `${myTasks.data.meta.total} open tasks assigned to you`}>
          {myTasks.isPending && <SkeletonTiles count={2} />}
          {myTasks.data?.data.length === 0 && (
            <Tile
              size="wide"
              tone="work"
              label="No open tasks"
              front={<p className="mt-auto text-[26px] font-light">Nothing assigned to you. Enjoy the calm.</p>}
            />
          )}
          {myTasks.data?.data.slice(0, 6).map((task) => (
            <Tile
              key={task.id}
              size="medium"
              tone={task.isOverdue ? 'alert' : 'work'}
              label={task.title}
              href={`/projects/${task.projectId}/tasks?task=${task.id}`}
              front={
                <>
                  <div className="flex items-start justify-between text-xs uppercase">
                    <TaskListLtrRegular aria-hidden fontSize={20} />
                    {task.priority}
                  </div>
                  <p className="mt-2 line-clamp-3 text-lg leading-tight font-light">{task.title}</p>
                  <p className="mt-auto truncate text-xs">
                    {STATUS_LABELS[task.status]} · {task.isOverdue ? 'Overdue' : (task.dueDate ?? 'No due date')}
                  </p>
                  <p className="truncate text-xs opacity-80">{task.projectName}</p>
                </>
              }
            />
          ))}
        </TileGroup>

        <TileGroup title="Projects">
          {projects.isPending && <SkeletonTiles count={2} wide />}
          {projects.data?.data.map((p) => <ProjectTile key={p.id} project={p} />)}
        </TileGroup>

        <TileGroup title="Updates">
          <Tile
            size="wide"
            tone="notification"
            label="Notifications"
            href={latest ? notificationHref(latest) : '/dashboard'}
            front={
              <>
                <div className="flex items-start justify-between">
                  <AlertRegular aria-hidden fontSize={24} />
                  <span className="text-5xl font-light">{notifications.data?.unreadCount ?? 0}</span>
                </div>
                <p className="mt-auto line-clamp-2 text-lg font-light">
                  {latest ? notificationText(latest) : "You're all caught up."}
                </p>
                <p className="text-xs">Unread notifications</p>
              </>
            }
          />
          {isAdmin && (
            <>
              <Tile
                size="medium"
                tone="user"
                label="Users"
                href="/users"
                front={
                  <>
                    <PeopleRegular aria-hidden fontSize={28} />
                    <p className="mt-auto text-2xl font-light">Users</p>
                    <p className="text-xs">Create, change roles, deactivate</p>
                  </>
                }
              />
              <Tile
                size="medium"
                tone="activity"
                label="System activity"
                href="/activity"
                front={
                  <>
                    <PulseRegular aria-hidden fontSize={28} />
                    <p className="mt-auto text-2xl font-light">Activity</p>
                    <p className="text-xs">Everything, as it happens</p>
                  </>
                }
              />
            </>
          )}
        </TileGroup>
      </Panorama>
    </main>
  );
}
