'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowCounterclockwiseRegular } from '@/components/icons';

export type TileSize = 'small' | 'medium' | 'wide' | 'large';
export type TileTone = 'work' | 'project' | 'notification' | 'user' | 'activity' | 'alert' | 'stat';

const SPAN: Record<TileSize, string> = {
  small: 'col-span-1 row-span-1',
  medium: 'col-span-2 row-span-2',
  wide: 'col-span-4 row-span-2',
  large: 'col-span-4 row-span-4',
};

const TONE: Record<TileTone, string> = {
  work: 'bg-tile-work',
  project: 'bg-tile-project',
  notification: 'bg-tile-notification',
  user: 'bg-tile-user',
  activity: 'bg-tile-activity',
  alert: 'bg-tile-alert',
  stat: 'bg-tile-stat',
};

/** Seconds a flipped tile stays open without interaction (UI_REQUIREMENTS §1.3). */
const AUTO_RETURN_MS = 10_000;

// Only one tile is flipped at a time across the page
const FlipContext = createContext<{ openId: string | null; setOpenId: (id: string | null) => void } | null>(null);

export function TileFlipProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return <FlipContext.Provider value={value}>{children}</FlipContext.Provider>;
}

interface TileProps {
  size: TileSize;
  tone: TileTone;
  /** Accessible name of the tile (what a screen reader announces for the front). */
  label: string;
  front: React.ReactNode;
  /** Back face (details + actions). When present, clicking the front flips the tile. */
  back?: React.ReactNode;
  /** When there is no back face, the tile is a link. */
  href?: string;
  /** Deactivated / archived: shown dimmed. */
  dimmed?: boolean;
}

export function Tile({ size, tone, label, front, back, href, dimmed }: TileProps) {
  const id = useId();
  const flip = useContext(FlipContext);
  const [localOpen, setLocalOpen] = useState(false);
  const flipped = back !== undefined && (flip ? flip.openId === id : localOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const setFlipped = useCallback(
    (value: boolean) => {
      if (flip) flip.setOpenId(value ? id : flip.openId === id ? null : flip.openId);
      else setLocalOpen(value);
    },
    [flip, id],
  );

  const close = useCallback(
    (returnFocus: boolean) => {
      setFlipped(false);
      if (returnFocus) requestAnimationFrame(() => frontRef.current?.focus());
    },
    [setFlipped],
  );

  // While flipped: Esc, a click outside, or idling closes it; focus moves to the first action
  useEffect(() => {
    if (!flipped) return;
    const firstAction = backRef.current?.querySelector<HTMLElement>('a, button, input, select, textarea');
    firstAction?.focus({ preventScroll: true });

    let timer = setTimeout(() => close(false), AUTO_RETURN_MS);
    const keepAlive = () => {
      clearTimeout(timer);
      timer = setTimeout(() => close(false), AUTO_RETURN_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    const root = rootRef.current;
    root?.addEventListener('pointermove', keepAlive);
    root?.addEventListener('keydown', keepAlive);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      clearTimeout(timer);
      root?.removeEventListener('pointermove', keepAlive);
      root?.removeEventListener('keydown', keepAlive);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [flipped, close]);

  const face = `flex h-full flex-col p-4 text-white sm:p-5 ${TONE[tone]}`;
  const frontInteractive = 'text-left outline-offset-[-4px] hover:brightness-110 transition-[filter]';

  return (
    <div
      ref={rootRef}
      className={`tile-flip ${SPAN[size]} ${dimmed ? 'opacity-60' : ''}`}
      data-flipped={flipped}
    >
      <div className="tile-flip-inner">
        {back !== undefined ? (
          <button
            ref={frontRef}
            type="button"
            aria-label={label}
            aria-expanded={flipped}
            inert={flipped}
            onClick={() => setFlipped(true)}
            className={`tile-front ${face} ${frontInteractive}`}
          >
            {front}
          </button>
        ) : href ? (
          <Link href={href} aria-label={label} className={`tile-front ${face} ${frontInteractive}`}>
            {front}
          </Link>
        ) : (
          <div role="group" aria-label={label} className={`tile-front ${face}`}>
            {front}
          </div>
        )}

        {back !== undefined && (
          <div
            ref={backRef}
            role="group"
            aria-label={`${label}: details`}
            inert={!flipped}
            className={`tile-back ${face} relative`}
          >
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="Flip back"
              className="absolute top-3 right-3 p-1 hover:bg-white/15"
            >
              <ArrowCounterclockwiseRegular fontSize={18} aria-hidden />
            </button>
            {back}
          </div>
        )}
      </div>
    </div>
  );
}

/** A named group of tiles on the 4-unit Metro grid. */
export function TileGroup({ title, children, footer }: { title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="w-full shrink-0 sm:w-[calc(4*var(--tile-unit)+3*var(--tile-gap))]">
      <h2 className="mb-4 text-2xl font-light sm:text-[28px]">{title}</h2>
      <div
        className="grid grid-flow-dense"
        style={{
          gridTemplateColumns: 'repeat(4, var(--tile-unit))',
          gridAutoRows: 'var(--tile-unit)',
          gap: 'var(--tile-gap)',
        }}
      >
        {children}
      </div>
      {footer && <div className="mt-4 text-sm text-muted">{footer}</div>}
    </section>
  );
}

/** Metro panorama: groups side by side on desktop (scrolling sideways if needed), stacked on phones. */
export function Panorama({ children }: { children: React.ReactNode }) {
  return (
    <TileFlipProvider>
      <div className="flex flex-col gap-10 pb-4 lg:flex-row lg:gap-[30px] lg:overflow-x-auto">{children}</div>
    </TileFlipProvider>
  );
}

/** Text links/actions on a tile's back face. */
export function TileActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm [&>*]:underline-offset-4 [&>*:hover]:underline">{children}</div>;
}
