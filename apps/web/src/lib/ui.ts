// Shared Metro control styles (square corners, flat fills).
export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 bg-accent px-5 py-2.5 text-[15px] text-accent-fg hover:brightness-110 disabled:bg-disabled-bg disabled:text-disabled-fg',
  secondary:
    'inline-flex items-center justify-center gap-2 border-2 border-border bg-surface px-5 py-2 text-[15px] hover:border-accent disabled:text-disabled-fg',
  danger:
    'inline-flex items-center justify-center gap-2 bg-danger px-5 py-2.5 text-[15px] text-white hover:brightness-110 disabled:bg-disabled-bg disabled:text-disabled-fg',
  link: 'text-accent-text underline-offset-4 hover:underline',
} as const;

export const inputClass = (invalid = false) =>
  `w-full border-2 bg-surface px-3 py-2.5 text-[15px] outline-none ${
    invalid ? 'border-danger' : 'border-border focus:border-accent'
  }`;
