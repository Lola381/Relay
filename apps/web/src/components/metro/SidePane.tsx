'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { DismissRegular } from '@/components/icons';

/**
 * Settings-style pane sliding in from the right (create/edit forms). Full screen on phones.
 * With `dirty`, closing asks before discarding unsaved changes.
 */
export function SidePane({
  open,
  onOpenChange,
  title,
  dirty = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  dirty?: boolean;
  children: React.ReactNode;
}) {
  const requestChange = (next: boolean) => {
    if (!next && dirty && !window.confirm('Discard your unsaved changes?')) return;
    onOpenChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={requestChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-surface px-6 py-8 text-fg shadow-2xl outline-none sm:w-[480px] sm:px-8 motion-safe:animate-[pane-in_220ms_ease-out]"
          aria-describedby={undefined}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <Dialog.Title className="text-4xl font-light">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="p-1 hover:bg-border-subtle">
              <DismissRegular fontSize={22} aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
