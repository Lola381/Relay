'use client';

import Link from 'next/link';

export interface AppBarAction {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

/**
 * Windows 8 bottom command bar: circular glyph buttons with labels. Fixed to the bottom; pages
 * that render it get extra bottom padding from the (app) layout.
 */
export function AppBar({ actions }: { actions: AppBarAction[] }) {
  if (actions.length === 0) return null;
  return (
    <nav aria-label="Page commands" className="fixed inset-x-0 bottom-0 z-30 bg-appbar text-white">
      <ul className="flex gap-2 overflow-x-auto px-4 py-3 sm:gap-6 sm:px-16">
        {actions.map((action) => {
          const content = (
            <>
              <span className="flex size-11 items-center justify-center rounded-full border-2 border-white text-xl">
                {action.icon}
              </span>
              <span className="text-xs whitespace-nowrap">{action.label}</span>
            </>
          );
          const cls =
            'flex min-w-16 flex-col items-center gap-1.5 px-1 py-1 hover:bg-white/10 disabled:opacity-40';
          return (
            <li key={action.label}>
              {action.href ? (
                <Link href={action.href} className={cls}>
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={action.onClick} disabled={action.disabled} className={cls}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
