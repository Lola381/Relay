'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Metro pivot headers: large text tabs, the inactive ones dimmed. Each item is its own route. */
export function Pivot({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="flex gap-6 overflow-x-auto sm:gap-9">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className="text-3xl font-light whitespace-nowrap text-muted/60 hover:text-muted aria-[current=page]:text-fg sm:text-[34px]"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
