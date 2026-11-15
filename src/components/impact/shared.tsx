import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIP_WIDTH = 272;
const GAP = 6;
const EDGE = 8;

/**
 * Hover / focus / tap tooltip. Rendered in a portal with fixed positioning so it is
 * never clipped by the hub's scroll areas, and flipped above the trigger when there
 * is no room below.
 */
export function InfoTip({
  children,
  label = 'More information',
  trigger,
  className,
}: {
  children: ReactNode;
  /** Accessible name of the trigger when it is the bare ⓘ icon. */
  label?: string;
  /** Custom trigger content (e.g. a status pill); defaults to an ⓘ icon. */
  trigger?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const pinned = useRef(false);

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const tip = tipRef.current;
    if (!t || !tip) return;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(Math.max(t.left + t.width / 2 - w / 2, EDGE), window.innerWidth - w - EDGE);
    const below = t.bottom + GAP;
    const top = below + h > window.innerHeight - EDGE && t.top - GAP - h > EDGE ? t.top - GAP - h : below;
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      pinned.current = false;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={trigger ? undefined : label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned.current && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          pinned.current = false;
          setOpen(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          pinned.current = !pinned.current || !open;
          setOpen(pinned.current);
        }}
        className={cn(
          trigger
            ? 'inline-flex shrink-0 cursor-help items-center'
            : 'inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-white/45 transition-colors hover:text-white/85 focus-visible:text-white',
          'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
          className,
        )}
      >
        {trigger ?? <Info className="h-3.5 w-3.5" aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: `min(${TIP_WIDTH}px, calc(100vw - ${EDGE * 2}px))` }}
            className="tip-in pointer-events-none fixed z-[2000] rounded-[6px] border border-white/[0.16] bg-[#161616]/95 px-3 py-2 text-left text-[12px] font-normal normal-case leading-5 tracking-normal text-white/85 shadow-[0_12px_32px_rgba(0,0,0,0.55)] backdrop-blur-sm"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

const pill = 'inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]';

/** Visible tag for anything that is not a real operational system; `info` explains what is simulated. */
export function SimTag({ kind = 'Simulated', info, className }: { kind?: 'Simulated' | 'Demo'; info?: ReactNode; className?: string }) {
  const body = (
    <span className={cn(pill, 'border-[#c4b5fd]/35 bg-[#c4b5fd]/10 text-[#c4b5fd]', !!info && 'hover:border-[#c4b5fd]/60 hover:bg-[#c4b5fd]/15', className)}>
      {kind}
      {info && <Info className="h-3 w-3" aria-hidden />}
    </span>
  );
  return info ? <InfoTip trigger={body}>{info}</InfoTip> : body;
}

export function LiveTag({ children = 'Live data', info }: { children?: ReactNode; info?: ReactNode }) {
  const body = (
    <span className={cn(pill, 'border-[#6ee7b7]/30 bg-[#6ee7b7]/10 text-[#6ee7b7]', !!info && 'hover:border-[#6ee7b7]/55')}>
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#6ee7b7]" aria-hidden />
      {children}
      {info && <Info className="h-3 w-3" aria-hidden />}
    </span>
  );
  return info ? <InfoTip trigger={body}>{info}</InfoTip> : body;
}

export function Panel({
  title,
  tag,
  info,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  tag?: ReactNode;
  /** Optional explanation behind an ⓘ next to the title. */
  info?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex flex-col rounded-[6px] border border-white/[0.12] bg-[#111111]', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <h3 className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85">
          <span className="truncate">{title}</span>
          {info && <InfoTip>{info}</InfoTip>}
        </h3>
        {tag}
      </div>
      <div className={cn('flex-1 px-3 py-3', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-5 text-white/60">{children}</p>;
}

/** Small uppercase section label used inside cards. */
export function SubHead({ children, info, right }: { children: ReactNode; info?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h4 className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
        {children}
        {info && <InfoTip>{info}</InfoTip>}
      </h4>
      {right}
    </div>
  );
}

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-[6px] bg-accent-500 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/50';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-white/[0.14] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white/75 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
