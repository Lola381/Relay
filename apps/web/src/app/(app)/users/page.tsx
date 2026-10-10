'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SYSTEM_ROLES, type Paginated, type SystemRole, type UserSummary } from '@pm/shared';
import { PersonAddRegular } from '@/components/icons';
import { AppBar } from '@/components/metro/AppBar';
import { SidePane } from '@/components/metro/SidePane';
import { EmptyState, ErrorState, LoadingState } from '@/components/metro/States';
import { api, ApiError } from '@/lib/api/client';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { roleLabel } from '@/lib/format';
import { canInSystem } from '@/lib/permissions';
import { btn, inputClass } from '@/lib/ui';
import { useDebounced } from '@/lib/useDebounced';

/** User management (Admin): create users, change system roles, deactivate / reactivate. */
export default function UsersPage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [creating, setCreating] = useState(false);
  const allowed = canInSystem(user, 'user.manage');

  const users = useQuery({
    queryKey: ['users', 'admin', debounced],
    queryFn: ({ signal }) =>
      api<Paginated<UserSummary>>(`/users?pageSize=100&search=${encodeURIComponent(debounced)}`, { signal }),
    enabled: allowed,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: SystemRole; isActive?: boolean }) =>
      api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast.success('User updated');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the user.'),
  });

  return (
    <main className="px-4 pt-6 sm:px-16">
      <h1 className="mb-8 text-5xl font-light sm:text-7xl">Users</h1>
      {!allowed ? (
        <EmptyState title="Administrators only" />
      ) : (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            aria-label="Search users"
            className={`${inputClass()} mb-6 max-w-md`}
          />
          {users.isPending && <LoadingState label="Loading users" />}
          {users.isError && <ErrorState error={users.error} onRetry={() => users.refetch()} />}
          {users.data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="text-sm text-muted">
                  <tr>
                    <th className="py-2 font-normal">Name</th>
                    <th className="py-2 font-normal">Email</th>
                    <th className="py-2 font-normal">Role</th>
                    <th className="py-2 font-normal">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.data.data.map((u) => (
                    <tr key={u.id} className={`border-t border-border-subtle ${u.isActive ? '' : 'text-muted'}`}>
                      <td className="py-3">{u.name}</td>
                      <td className="py-3">{u.email}</td>
                      <td className="py-3">
                        <select
                          aria-label={`Role of ${u.name}`}
                          value={u.role}
                          disabled={u.id === user.id || update.isPending}
                          onChange={(e) => update.mutate({ id: u.id, role: e.target.value as SystemRole })}
                          className="border-2 border-border bg-surface px-2 py-1"
                        >
                          {SYSTEM_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3">{u.isActive ? 'Active' : 'Deactivated'}</td>
                      <td className="py-3 text-right">
                        {u.id !== user.id && (
                          <button
                            className={btn.link}
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: u.id, isActive: !u.isActive })}
                          >
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AppBar actions={[{ label: 'New user', icon: <PersonAddRegular />, onClick: () => setCreating(true) }]} />
          <CreateUserPane open={creating} onOpenChange={setCreating} />
        </>
      )}
    </main>
  );
}

function CreateUserPane({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'TEAM_MEMBER' as SystemRole });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: form }),
    onSuccess: () => {
      toast.success('User created');
      setForm({ name: '', email: '', password: '', role: 'TEAM_MEMBER' });
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the user.'),
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <SidePane open={open} onOpenChange={onOpenChange} title="New user" dirty={form.name.length > 0}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        {error && <p className="text-danger" role="alert">{error}</p>}
        <label className="block">
          <span className="mb-1.5 block">Name *</span>
          <input required maxLength={100} value={form.name} onChange={set('name')} className={inputClass()} />
        </label>
        <label className="block">
          <span className="mb-1.5 block">Email *</span>
          <input required type="email" value={form.email} onChange={set('email')} className={inputClass()} />
        </label>
        <label className="block">
          <span className="mb-1.5 block">Temporary password * (min 8)</span>
          <input required minLength={8} type="password" value={form.password} onChange={set('password')} className={inputClass()} />
        </label>
        <label className="block">
          <span className="mb-1.5 block">System role</span>
          <select value={form.role} onChange={set('role')} className={inputClass()}>
            {SYSTEM_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={btn.primary} disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create user'}
        </button>
      </form>
    </SidePane>
  );
}
