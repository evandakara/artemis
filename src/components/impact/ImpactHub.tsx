import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';

import { MONTH_LABELS } from '@/data/historyApi';
import { cn } from '@/lib/utils';
import type { FireHotspot } from '@/types';
import type { InspectTarget } from '@/components/HotspotInspector';
import { useHubContext } from './hubContext';
import { EscrowTab } from './EscrowTab';
import { GroundTruthTab } from './GroundTruthTab';
import { HazeShieldTab, type HazeCone } from './HazeShieldTab';
import { WatchdogTab } from './WatchdogTab';
import { InfoTip } from './shared';
import { useCountUp } from './useCountUp';

export type HubTab = 'escrow' | 'ground' | 'haze' | 'watchdog';

const TABS: { id: HubTab; num: string; label: string; short: string }[] = [
  { id: 'escrow', num: '01', label: 'Satellite escrow', short: 'Escrow' },
  { id: 'ground', num: '02', label: 'Citizen ground-truth', short: 'Ground-truth' },
  { id: 'haze', num: '03', label: 'Downwind haze shield', short: 'Haze' },
  { id: 'watchdog', num: '04', label: 'Civic watchdog & P2P', short: 'Watchdog' },
];

interface Props {
  target: InspectTarget;
  /** Live detections for the current day, used for nearby-detection lists. */
  liveHotspots: FireHotspot[];
  variant: 'modal' | 'page';
  initialTab?: HubTab;
  /** Rect of the button that opened the hub; the modal grows out of it. */
  origin?: DOMRect | null;
  onClose?: () => void;
  /** Dashboard only: draw the haze cone on the main map (the dashboard closes the hub). */
  onShowCone?: (cone: HazeCone) => void;
  /** Dashboard only: fly the main map to a donation campaign. */
  onViewLocation?: (lat: number, lng: number, zoom: number) => void;
}

const HOT = '#fca5a5';
const WARM = '#fdba74';

/** One headline number: small label, large value, plain-language caption, optional meter. */
function Kpi({
  label,
  info,
  value,
  unit,
  caption,
  color,
  meter,
}: {
  label: string;
  info?: ReactNode;
  value: string;
  unit?: string;
  caption: string;
  color?: string;
  /** 0–1 fill for the thin meter under the value. */
  meter?: number | null;
}) {
  return (
    <div className="kpi-tile bg-[linear-gradient(180deg,#171717_0%,#0f0f0f_100%)] px-3.5 pb-3 pt-2.5">
      <dt className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
        {label}
        {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
      </dt>
      <dd className="mt-1.5">
        <span className="font-sans text-[26px] font-semibold leading-none tabular-nums tracking-tight" style={{ color: color ?? 'rgba(255,255,255,0.95)' }}>
          {value}
        </span>
        {unit && <span className="ml-1 font-mono text-[11px] text-white/50">{unit}</span>}
        {meter != null && (
          <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
            <span className="meter-fill block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, meter * 100))}%`, backgroundColor: color ?? '#d9831c' }} />
          </span>
        )}
        <span className="mt-1.5 block text-[11px] leading-4 text-white/55 sm:truncate">{caption}</span>
      </dd>
    </div>
  );
}

function anomalyWords(z: number): string {
  if (z >= 1.5) return 'well above normal';
  if (z >= 0.5) return 'above normal';
  if (z > -0.5) return 'about normal';
  return 'below normal';
}

const EASE_OUT = 'cubic-bezier(0.2, 0.75, 0.15, 1)';
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ImpactHub({ target, liveHotspots, variant, initialTab = 'escrow', origin, onClose, onShowCone, onViewLocation }: Props) {
  const ctx = useHubContext(target);
  const [tab, setTab] = useState<HubTab>(initialTab);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Record<HubTab, HTMLButtonElement | null>>({ escrow: null, ground: null, haze: null, watchdog: null });

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  // Open: the dialog grows out of the "Open impact hub" button (a clip-path from the
  // button's rect to the full panel) under a fading ember flash. Web Animations API,
  // so the dashboard bundle carries no animation library.
  useLayoutEffect(() => {
    if (variant !== 'modal' || prefersReducedMotion()) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
    const d = dialog.getBoundingClientRect();
    const from = origin
      ? `inset(${Math.max(0, origin.top - d.top)}px ${Math.max(0, d.right - origin.right)}px ${Math.max(0, d.bottom - origin.bottom)}px ${Math.max(0, origin.left - d.left)}px round 6px)`
      : 'inset(45% 45% 45% 45% round 6px)';
    dialog.animate([{ clipPath: from }, { clipPath: 'inset(0px 0px 0px 0px round 6px)' }], { duration: 640, easing: EASE_OUT });
    flashRef.current?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 900, easing: 'ease-out', fill: 'forwards' });
    dialog.querySelectorAll<HTMLElement>('[data-hub-stagger]').forEach((el, i) =>
      el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 260 + i * 70, easing: EASE_OUT, fill: 'backwards' }),
    );
  }, [variant, origin]);

  // Close: a short fade and sink before unmounting.
  const requestClose = useCallback(() => {
    if (!onClose || closing.current) return;
    if (variant !== 'modal' || prefersReducedMotion() || !dialogRef.current) return onClose();
    closing.current = true;
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    dialogRef.current
      .animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px) scale(0.985)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
      .finished.then(onClose, onClose);
  }, [onClose, variant]);

  useEffect(() => {
    headingRef.current?.focus();
    if (!onClose) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, requestClose]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  const f = ctx.forensic.data;
  const z = ctx.monthRecord?.z ?? null;
  const live = target.live;
  const frp = useCountUp(live ? live.frp : null);
  const zShown = useCountUp(z);
  const scoreShown = useCountUp(f ? f.score : null);
  const pctShown = useCountUp(f ? f.percentile : null);
  const outside = ctx.archive === 'outside';
  const permalink = `/impact?lat=${target.lat.toFixed(4)}&lng=${target.lng.toFixed(4)}${target.archive ? `&month=${target.archive.year}-${String(target.archive.month).padStart(2, '0')}` : ''}`;

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <header data-hub-stagger className="border-b border-[#a3a3a3]/15 px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Impact hub</p>
            <h2 id="impact-title" ref={headingRef} tabIndex={-1} className="mt-1 truncate text-base font-semibold text-white outline-none sm:text-lg">
              {ctx.place ?? 'Locating…'}
            </h2>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-white/55">
              {target.lat.toFixed(4)}, {target.lng.toFixed(4)}
              {ctx.country && !ctx.place?.includes(ctx.country) ? ` · ${ctx.country}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {variant === 'modal' && (
              <Link to={permalink} className="hidden items-center gap-1 rounded-[4px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/60 hover:bg-white/[0.06] hover:text-white sm:flex">
                Open as page <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {onClose && (
              <button type="button" onClick={requestClose} aria-label="Close impact hub" className="rounded-[4px] p-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/[0.14] bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:grid-cols-4">
          {live ? (
            <Kpi label="Fire power now" value={(frp ?? 0).toFixed(1)} unit="MW" caption={`${live.satellite ?? live.source} · ${live.confidence}% confidence`} color={live.frp >= 20 ? HOT : WARM} />
          ) : (
            <Kpi
              label={target.archive?.value ? 'Archive cell-days' : 'Fire power now'}
              value={target.archive?.value ? target.archive.value.toFixed(1) : '—'}
              caption={target.archive?.value ? `${MONTH_LABELS[target.archive.month - 1]} ${target.archive.year}` : 'No live detection here today'}
            />
          )}
          <Kpi
            label="Anomaly"
            info={
              <>
                How unusual fire activity in {outside ? 'the region' : ctx.calendarRegion.name} is this month compared with the same month in 2001–2025. Worked out as (month − median) ÷ IQR. <strong className="text-white">+1.5 or more</strong> counts as abnormal.
                {outside && ` The 26-year harmonized archive covers Indonesia only, so there is no baseline for ${ctx.country ?? 'this country'}.`}
              </>
            }
            value={outside ? 'n/a' : zShown === null ? (ctx.months.length ? '—' : '…') : `${zShown >= 0 ? '+' : ''}${zShown.toFixed(2)}`}
            unit={z === null ? undefined : 'σ'}
            caption={
              outside
                ? 'Fire history covers Indonesia only'
                : `${MONTH_LABELS[ctx.month.month - 1]} ${ctx.month.year} · ${z === null ? (ctx.months.length ? 'too little variation to compare' : 'loading') : anomalyWords(z)}`
            }
            color={z !== null && z >= 1.5 ? HOT : z !== null && z >= 0.5 ? WARM : undefined}
          />
          <Kpi
            label="Signature score"
            info={
              <>
                A rule-based 0–100 score of how much the fire pattern here looks human-driven, from four features: burning that recurs over the years, burning outside the fire season, line-shaped clusters, and afternoon timing. <strong className="text-white">It is not a probability</strong> and never says who started a fire.
              </>
            }
            value={scoreShown === null ? (ctx.forensic.status === 'loading' && !outside ? '…' : 'n/a') : String(Math.round(scoreShown))}
            unit={f ? '/ 100' : undefined}
            caption={f ? 'Rule-based pattern score' : outside ? 'Scored for Indonesia only' : 'Too little fire history to score'}
            meter={f ? f.score / 100 : null}
            color={f && f.percentile >= 90 ? HOT : undefined}
          />
          <Kpi
            label="National rank"
            value={pctShown === null ? (ctx.forensic.status === 'loading' && !outside ? '…' : 'n/a') : `p${Math.round(pctShown)}`}
            caption={f ? `Higher than ${Math.round(f.percentile)}% of Indonesian fire cells` : outside ? 'Ranked within Indonesia only' : 'Not ranked'}
            meter={f ? f.percentile / 100 : null}
            color={f && f.percentile >= 90 ? HOT : undefined}
          />
        </dl>
      </header>

      <div data-hub-stagger role="tablist" aria-label="Impact branches" className="flex gap-px overflow-x-auto border-b border-white/[0.1] bg-white/[0.06]">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => (tabRefs.current[t.id] = el)}
            id={`hub-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`hub-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
            className={cn(
              'flex min-w-0 flex-1 items-baseline gap-2 whitespace-nowrap px-3 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.08em] transition-colors',
              tab === t.id ? 'bg-[#0b0b0b] text-white shadow-[inset_0_-2px_0_#d9831c]' : 'bg-[#080808] text-white/60 hover:text-white/85',
            )}
          >
            <span className={tab === t.id ? 'text-accent-300' : 'text-white/45'}>{t.num}</span>
            <span className="hidden md:inline">{t.label}</span>
            <span className="md:hidden">{t.short}</span>
          </button>
        ))}
      </div>

      <div data-hub-stagger key={tab} id={`hub-panel-${tab}`} role="tabpanel" aria-labelledby={`hub-tab-${tab}`} className="tab-panel-in min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {tab === 'escrow' && <EscrowTab ctx={ctx} onViewLocation={onViewLocation} />}
        {tab === 'ground' && <GroundTruthTab ctx={ctx} />}
        {tab === 'haze' && <HazeShieldTab ctx={ctx} onShowCone={onShowCone} />}
        {tab === 'watchdog' && <WatchdogTab ctx={ctx} liveHotspots={liveHotspots} />}
      </div>
    </div>
  );

  if (variant === 'page') return <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#0b0b0b]">{body}</div>;

  return (
    <div ref={backdropRef} className="fixed inset-0 z-[1600] flex items-stretch justify-center bg-black/70 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="impact-title" className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden border border-white/[0.14] bg-[#0b0b0b] shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:h-[88vh] sm:rounded-[6px]">
        {body}
        <div ref={flashRef} aria-hidden className="pointer-events-none absolute inset-0 opacity-0" style={{ background: 'radial-gradient(80% 60% at 50% 100%, rgba(230,148,48,0.55), rgba(158,67,36,0.25) 45%, transparent 75%)' }} />
      </div>
    </div>
  );
}
