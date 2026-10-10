'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ERROR_CODES, type Project } from '@pm/shared';
import { TextAreaField, TextField } from '@/components/metro/Field';
import { MessageBand } from '@/components/metro/MessageBand';
import { SidePane } from '@/components/metro/SidePane';
import { ApiError } from '@/lib/api/client';
import { useUpdateProject } from '@/lib/api/queries/projects';
import { applyServerErrors } from '@/lib/forms';
import { btn } from '@/lib/ui';

interface FormValues {
  name: string;
  description: string;
}

interface Conflict {
  message: string;
  latest: Project;
}

const FIELDS: { key: keyof FormValues; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
];

const baseFrom = (p: Project) => ({
  version: p.version,
  values: { name: p.name, description: p.description ?? '' } satisfies FormValues,
});

/**
 * Edit name/description. The version the form was opened with is sent along; if someone saved
 * in between, the API answers 409 and the pane shows what changed (UI_REQUIREMENTS §4.1).
 */
export function EditProjectPane({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateProject(project.id);
  // The version + values this edit is based on. Only fields that differ from it are sent.
  const [base, setBase] = useState(() => baseFrom(project));
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [band, setBand] = useState<string | null>(null);

  const { register, handleSubmit, setError, setValue, control, reset, getValues, formState } = useForm<FormValues>({
    defaultValues: base.values,
  });
  const [name, description] = useWatch({ control, name: ['name', 'description'] });

  const openChange = (next: boolean) => {
    if (next) {
      const fresh = baseFrom(project);
      setBase(fresh);
      reset(fresh.values);
    }
    setConflict(null);
    setBand(null);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setBand(null);
    const changes = Object.fromEntries(
      FIELDS.filter(({ key }) => values[key] !== base.values[key]).map(({ key }) => [key, values[key]]),
    );
    if (Object.keys(changes).length === 0) return onOpenChange(false);
    try {
      await update.mutateAsync({ version: base.version, ...changes });
      toast.success('Project updated');
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === ERROR_CODES.VERSION_CONFLICT) {
        const details = err.details as { current: Project };
        setConflict({ message: err.message, latest: details.current });
        return;
      }
      setBand(applyServerErrors(err, setError, ['name', 'description']));
    }
  });


  return (
    <SidePane open={open} onOpenChange={openChange} title="Edit project" dirty={formState.isDirty}>
      {conflict ? (
        <div className="space-y-5">
          <MessageBand tone="warning">{conflict.message}</MessageBand>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-2 pr-3 font-normal">Field</th>
                <th className="py-2 pr-3 font-normal">Your change</th>
                <th className="py-2 font-normal">Latest version</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(({ key, label }) => {
                const mine = getValues(key);
                const theirs = baseFrom(conflict.latest).values[key];
                const before = base.values[key];
                const bothChanged = mine !== before && theirs !== before && mine !== theirs;
                return (
                  <tr key={key} className={`border-t border-border-subtle align-top ${bothChanged ? 'bg-warning/10' : ''}`}>
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {label}
                      {bothChanged && <span className="block text-xs text-warning">Both changed</span>}
                    </th>
                    <td className="py-2 pr-3 break-words">{mine || <em className="text-muted">empty</em>}</td>
                    <td className="py-2 break-words">{theirs || <em className="text-muted">empty</em>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-3">
            <button
              className={btn.primary}
              onClick={() => {
                // Discard my edits: load the latest version into the form
                const latest = baseFrom(conflict.latest);
                setBase(latest);
                reset(latest.values);
                setConflict(null);
              }}
            >
              Use latest
            </button>
            <button
              className={btn.secondary}
              onClick={() => {
                // Keep only the fields I changed, on top of the latest version; review, then save again
                const latest = baseFrom(conflict.latest);
                const mine = getValues();
                reset(latest.values);
                for (const { key } of FIELDS) {
                  if (mine[key] !== base.values[key]) setValue(key, mine[key], { shouldDirty: true });
                }
                setBase(latest);
                setConflict(null);
              }}
            >
              Re-apply my changes
            </button>
            <button className={btn.secondary} onClick={() => setConflict(null)}>
              Keep editing
            </button>
          </div>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-5">
          {band && <MessageBand tone="error">{band}</MessageBand>}
          <TextField
            label="Name"
            required
            maxLength={120}
            error={formState.errors.name?.message}
            count={{ value: name.length, max: 120 }}
            {...register('name', { validate: (v) => v.trim().length > 0 || 'Name is required.' })}
          />
          <TextAreaField
            label="Description"
            rows={6}
            maxLength={5000}
            error={formState.errors.description?.message}
            count={{ value: description.length, max: 5000 }}
            {...register('description')}
          />
          <div className="flex gap-3">
            <button type="submit" className={btn.primary} disabled={formState.isSubmitting || !formState.isDirty}>
              {formState.isSubmitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={btn.secondary} onClick={() => openChange(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </SidePane>
  );
}
