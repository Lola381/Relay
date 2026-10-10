'use client';

import { forwardRef, useState } from 'react';
import { toast } from 'sonner';
import { canHoldProjectRole, PROJECT_ROLES, type Project, type ProjectRole, type UserSummary } from '@pm/shared';
import { Avatar } from '@/components/metro/Avatar';
import { MessageBand } from '@/components/metro/MessageBand';
import { ApiError } from '@/lib/api/client';
import { useAddMember, useUserSearch } from '@/lib/api/queries/projects';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { projectRoleLabel } from '@/lib/format';
import { canInProject } from '@/lib/permissions';
import { btn, inputClass } from '@/lib/ui';
import { useDebounced } from '@/lib/useDebounced';

/** "Add to project": find an active non-member, pick a role they're allowed to hold, add. */
export const AddMemberPanel = forwardRef<HTMLInputElement, { project: Project }>(function AddMemberPanel(
  { project },
  searchRef,
) {
  const user = useCurrentUser();
  const add = useAddMember(project.id);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const [selected, setSelected] = useState<UserSummary | null>(null);
  const [role, setRole] = useState<ProjectRole>('MEMBER');
  const [error, setError] = useState<string | null>(null);

  const results = useUserSearch(
    { notInProject: project.id, isActive: 'true', search: debounced || undefined, pageSize: 6 },
    !selected,
  );

  const allowedRoles = selected
    ? PROJECT_ROLES.filter(
        (r) => canHoldProjectRole(selected.role, r) && canInProject(user, project, 'member.add', { role: r }),
      )
    : [];

  const choose = (person: UserSummary) => {
    setSelected(person);
    setError(null);
    const roles = PROJECT_ROLES.filter(
      (r) => canHoldProjectRole(person.role, r) && canInProject(user, project, 'member.add', { role: r }),
    );
    setRole(roles.includes('MEMBER') ? 'MEMBER' : (roles[0] ?? 'VIEWER'));
  };

  const submit = async () => {
    if (!selected) return;
    setError(null);
    try {
      await add.mutateAsync({ userId: selected.id, role });
      toast.success(`${selected.name} added as ${projectRoleLabel(role)}`);
      setSelected(null);
      setSearch('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this person.');
    }
  };

  return (
    <section aria-labelledby="add-member-heading" className="w-full max-w-[420px] bg-surface p-5 sm:p-6">
      <h2 id="add-member-heading" className="text-2xl font-light sm:text-[28px]">
        Add to project
      </h2>
      {error && (
        <div className="mt-3">
          <MessageBand tone="error">{error}</MessageBand>
        </div>
      )}

      {selected ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={selected.name} url={selected.avatarUrl} size={36} />
            <p className="min-w-0 flex-1 truncate">
              {selected.name} · <span className="text-muted">{selected.email}</span>
            </p>
            <button type="button" className={btn.link} onClick={() => setSelected(null)}>
              Change
            </button>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[15px]">Project role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} className={inputClass()}>
              {allowedRoles.map((r) => (
                <option key={r} value={r}>
                  {projectRoleLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={btn.primary} onClick={submit} disabled={add.isPending || allowedRoles.length === 0}>
            {add.isPending ? 'Adding…' : 'Add member'}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="member-search" className="mb-1.5 block text-[15px]">
            Find active non-members
          </label>
          <input
            ref={searchRef}
            id="member-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass()}
            autoComplete="off"
          />
          <ul className="mt-3 space-y-1">
            {(results.data?.data ?? []).map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => choose(person)}
                  className="flex w-full items-center gap-3 px-1 py-1.5 text-left hover:bg-border-subtle"
                >
                  <Avatar name={person.name} url={person.avatarUrl} size={32} />
                  <span className="min-w-0 flex-1 truncate">
                    {person.name}
                    <span className="block truncate text-xs text-muted">{person.email}</span>
                  </span>
                </button>
              </li>
            ))}
            {results.isSuccess && results.data.data.length === 0 && (
              <li className="text-sm text-muted">Everyone matching is already in this project.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
});
