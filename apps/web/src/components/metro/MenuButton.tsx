'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CheckmarkRegular, ChevronDownRegular } from '@/components/icons';

/** Filter/sort control in the Metro style: "Status: Active ▾" with a radio menu. */
export function MenuButton<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-11 items-center gap-2 border-2 border-border bg-transparent px-3.5 text-[15px] hover:border-accent">
        {label}: {current}
        <ChevronDownRegular aria-hidden fontSize={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-48 border border-border-subtle bg-surface py-1 text-fg shadow-lg"
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 outline-none data-highlighted:bg-border-subtle"
              >
                <span className="w-4">
                  <DropdownMenu.ItemIndicator>
                    <CheckmarkRegular aria-hidden />
                  </DropdownMenu.ItemIndicator>
                </span>
                {option.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
