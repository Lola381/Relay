'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowLeftRegular, ChevronDownRegular, SignOutRegular } from '@/components/icons';
import { Avatar } from '@/components/metro/Avatar';
import { useAuth, useCurrentUser } from '@/lib/auth/AuthProvider';
import { roleLabel } from '@/lib/format';

const NAV = [
  { href: '/dashboard', label: 'Start' },
  { href: '/projects', label: 'Projects' },
];

/** Thin Metro top bar: back, brand, sections, and the user tile with its menu. */
export function TopBar() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isRoot = pathname === '/dashboard';

  return (
    <header className="flex h-16 items-center gap-4 px-4 sm:gap-6 sm:px-16">
      {!isRoot && (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-fg/70 hover:border-accent"
        >
          <ArrowLeftRegular aria-hidden fontSize={18} />
        </button>
      )}
      <Link href="/dashboard" className="text-2xl font-light">
        relay
      </Link>

      <nav aria-label="Main" className="hidden gap-6 sm:flex">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            className="text-[17px] text-muted hover:text-fg aria-[current=page]:text-fg"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="ml-auto flex items-center gap-3 py-2">
          <Avatar name={user.name} url={user.avatarUrl} />
          <span className="hidden text-[17px] sm:inline">{user.name}</span>
          <ChevronDownRegular aria-hidden fontSize={14} />
          <span className="sr-only">Account menu</span>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-64 border border-border-subtle bg-surface py-2 text-fg shadow-lg"
          >
            <div className="px-4 py-2">
              <p>{user.name}</p>
              <p className="text-sm text-muted">{user.email}</p>
              <p className="mt-1 text-sm text-accent-text">{roleLabel(user.role)}</p>
            </div>
            <DropdownMenu.Separator className="my-2 h-px bg-border-subtle" />
            {/* Phone: sections live in the menu */}
            <div className="sm:hidden">
              {NAV.map((item) => (
                <DropdownMenu.Item key={item.href} asChild>
                  <Link href={item.href} className="block px-4 py-2.5 outline-none data-highlighted:bg-border-subtle">
                    {item.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-2 h-px bg-border-subtle" />
            </div>
            <DropdownMenu.Item
              onSelect={() => void logout()}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 outline-none data-highlighted:bg-border-subtle"
            >
              <SignOutRegular aria-hidden fontSize={18} />
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
