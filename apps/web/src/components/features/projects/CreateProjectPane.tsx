'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { UserSummary } from '@pm/shared';
import { CheckmarkRegular } from '@/components/icons';
import { Avatar } from '@/components/metro/Avatar';
import { TextAreaField, TextField } from '@/components/metro/Field';
import { MessageBand } from '@/components/metro/MessageBand';
import { SidePane } from '@/components/metro/SidePane';
import { useCreateProject, useUserSearch } from '@/lib/api/queries/projects';
import { useDebounced } from '@/lib/useDebounced';
import { applyServerErrors } from '@/lib/forms';
import { btn, inputClass } from '@/lib/ui';

interface FormValues {
  name: string;
  description: string;
}

/** Admin: create a project and pick its managers (UI_REQUIREMENTS §3.3). */
export function CreateProjectPane({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const create = useCreateProject();
  const [managers, setManagers] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [band, setBand] = useState<string | null>(null);

  const { register, handleSubmit, setError, control, reset, formState } = useForm<FormValues>({
    defaultValues: { name: '', description: '' },
  });
  const [name, description] = useWatch({ control, name: ['name', 'description'] });

  const candidates = useUserSearch(
    { roles: 'ADMIN,PROJECT_MANAGER', isActive: 'true', search: debounced || undefined, pageSize: 8 },
    open,
  );

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      reset();
      setManagers([]);
      setSearch('');
      setBand(null);
    }
  };

  const toggle = (user: UserSummary) =>
    setManagers((current) =>
      current.some((m) => m.id === user.id) ? current.filter((m) => m.id !== user.id) : [...current, user],
    );

  const onSubmit = handleSubmit(async (values) => {
    setBand(null);
    if (!values.name.trim()) return setError('name', { message: 'Name is required.' });
    try {
      const project = await create.mutateAsync({
        name: values.name,
        description: values.description || null,
        managerIds: managers.map((m) => m.id),
      });
      toast.success(`Created ${project.name}`);
      close(false);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setBand(applyServerErrors(err, setError, ['name', 'description']));
    }
  });

  const options = [
    ...managers,
    ...(candidates.data?.data ?? []).filter((u) => !managers.some((m) => m.id === u.id)),
  ];

  return (
    <SidePane open={open} onOpenChange={close} title="New project" dirty={formState.isDirty || managers.length > 0}>
      <form noValidate onSubmit={onSubmit} className="space-y-5">
        {band && <MessageBand tone="error">{band}</MessageBand>}
        <TextField
          label="Name"
          required
          maxLength={120}
          autoFocus
          error={formState.errors.name?.message}
          count={{ value: name.length, max: 120 }}
          {...register('name')}
        />
        <TextAreaField
          label="Description"
          maxLength={5000}
          error={formState.errors.description?.message}
          count={{ value: description.length, max: 5000 }}
          {...register('description')}
        />

        <fieldset>
          <legend className="mb-1.5 text-[15px]">Managers</legend>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="manager-search">
            Find active admins and project managers
          </label>
          <input
            id="manager-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass()}
            autoComplete="off"
          />
          <ul className="mt-3 space-y-1" aria-label="Manager candidates">
            {options.map((user) => {
              const selected = managers.some((m) => m.id === user.id);
              return (
                <li key={user.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-1.5">
                    <input type="checkbox" className="peer sr-only" checked={selected} onChange={() => toggle(user)} />
                    <span className="flex size-6 items-center justify-center border-2 border-accent text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                      {selected && <CheckmarkRegular aria-hidden />}
                    </span>
                    <Avatar name={user.name} url={user.avatarUrl} size={36} />
                    <span>
                      {user.name}
                      <span className="block text-xs text-muted">{user.email}</span>
                    </span>
                  </label>
                </li>
              );
            })}
            {candidates.isSuccess && options.length === 0 && <li className="text-sm text-muted">No matching people.</li>}
          </ul>
          <p className="mt-2 text-sm text-muted">Optional. You can add managers later from the Team page.</p>
        </fieldset>

        <p className="text-sm text-muted">* Required</p>
        <div className="flex gap-3">
          <button type="submit" className={btn.primary} disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" className={btn.secondary} onClick={() => close(false)}>
            Cancel
          </button>
        </div>
      </form>
    </SidePane>
  );
}
