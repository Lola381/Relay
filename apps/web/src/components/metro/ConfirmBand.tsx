'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { btn } from '@/lib/ui';
import { MessageBand } from './MessageBand';

/**
 * Metro message band across the middle of the screen, for destructive or significant actions.
 * `onConfirm` may throw; its message is shown in the band and the band stays open.
 */
export function ConfirmBand({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  tone = 'accent',
  confirmDisabled = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  tone?: 'accent' | 'danger';
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setError(null);
          onOpenChange(next);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          role="alertdialog"
          className="fixed inset-x-0 top-1/2 z-50 max-h-[90vh] -translate-y-1/2 overflow-y-auto bg-surface py-8 text-fg outline-none sm:py-10"
        >
          <div className="mx-auto max-w-[1000px] px-4 sm:px-16">
            <Dialog.Title className="text-3xl font-light sm:text-4xl">{title}</Dialog.Title>
            <Dialog.Description asChild>
              <div className="mt-4 space-y-3">{children}</div>
            </Dialog.Description>
            {error && (
              <div className="mt-5">
                <MessageBand tone="error">{error}</MessageBand>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={confirm}
                disabled={busy || confirmDisabled}
                className={tone === 'danger' ? btn.danger : btn.primary}
              >
                {busy ? 'Working…' : confirmLabel}
              </button>
              <Dialog.Close className={btn.secondary} disabled={busy}>
                Cancel
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
