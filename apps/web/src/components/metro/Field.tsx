'use client';

import { forwardRef, useId } from 'react';
import { inputClass } from '@/lib/ui';

interface FieldShellProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  /** Shows "12 / 120" under the field. */
  count?: { value: number; max: number };
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string; className: string }) => React.ReactNode;
}

/** Label + control + inline error + character counter, wired up for screen readers. */
export function FieldShell({ label, required, error, hint, count, children }: FieldShellProps) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px]">
        {label} {required && <span aria-hidden>*</span>}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy, className: inputClass(!!error) })}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-1.5 flex justify-between gap-4 text-sm text-muted">
        {hint ? <p id={`${id}-hint`}>{hint}</p> : <span />}
        {count && (
          <span className={count.value > count.max ? 'text-danger' : undefined}>
            {count.value} / {count.max}
          </span>
        )}
      </div>
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & Omit<FieldShellProps, 'children'>;

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, required, error, hint, count, ...input },
  ref,
) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint} count={count}>
      {(props) => <input ref={ref} {...input} {...props} />}
    </FieldShell>
  );
});

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FieldShellProps, 'children'>;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaField(
  { label, required, error, hint, count, rows = 4, ...textarea },
  ref,
) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint} count={count}>
      {(props) => <textarea ref={ref} rows={rows} {...textarea} {...props} className={`${props.className} resize-y`} />}
    </FieldShell>
  );
});
