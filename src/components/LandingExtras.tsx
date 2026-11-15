// Landing page sections backed by real data: the telemetry ticker (meta.json + today's
// FIRMS NRT), preview cards for harmonization, the forensic score and the Impact Hub,
// and an optional tuning panel (/?tune=1) for the hero globe and the glass.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Fingerprint, GitMerge, HandHeart, SlidersHorizontal } from 'lucide-react';

import { LiquidGlass } from '@/components/LiquidGlass';
import { DEFAULT_GLASS, setGlassParams } from '@/lib/glassParams';
import { fetchLiveFirmsData, type LiveFireData } from '@/data/firmsApi';
import { fetchForensicIndex, fetchHistoryMeta, fetchRegionCalendar, type ForensicIndex, type HistoryMeta, type MonthRecord } from '@/data/historyApi';
import { useInView } from '@/lib/useInView';
import { cn } from '@/lib/utils';
import type { EarthTuning } from '@/components/landing/earthTuning';

const fmtMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

type Tone = 'live' | 'idle' | 'retired' | 'info';

function TickerItem({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <li className="flex shrink-0 items-center gap-3 px-7 py-4 sm:py-[1.15rem]">
      <span
        aria-hidden
        className={cn('h-2 w-2 rounded-full', tone === 'live' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : tone === 'retired' ? 'bg-white/40' : tone === 'info' ? 'bg-accent-400' : 'bg-amber-300')}
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/60">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-white/90 sm:text-[14px]">{value}</span>
    </li>
  );
}

/**
 * Clear border at the top of each landing section: index, a hairline that draws in as
 * the section arrives (landingMotion), and the section name.
 */
export function SectionRule({ index, label, tone = 'dark' }: { index: string; label: string; tone?: 'dark' | 'light' }) {
  return (
    <div data-rule className={cn('flex items-center gap-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em]', tone === 'dark' ? 'text-neutral-900' : 'text-white/80')}>
      <span data-rule-text className="tabular-nums">{index}</span>
      <span data-rule-line aria-hidden className={cn('h-px flex-1 origin-left', tone === 'dark' ? 'bg-neutral-900/35' : 'bg-white/35')} />
      <span data-rule-text>{label}</span>
    </div>
  );
}

/** A news-ticker band that scrolls the live satellite telemetry; hover or focus pauses it. */
export function TelemetryStrip() {
  const [meta, setMeta] = useState<HistoryMeta | null>(null);
  const [live, setLive] = useState<{ status: 'loading' | 'ready' | 'error'; data?: LiveFireData }>({ status: 'loading' });

  useEffect(() => {
    fetchHistoryMeta().then(setMeta).catch(() => setMeta(null));
    fetchLiveFirmsData()
      .then((data) => setLive({ status: 'ready', data }))
      .catch(() => setLive({ status: 'error' }));
  }, []);

  const counts = useMemo(() => {
    const all = live.data ? [...live.data.modisHotspots, ...live.data.viirsHotspots] : [];
    const c: Record<string, number> = { Terra: 0, Aqua: 0, 'NOAA-20': 0, 'NOAA-21': 0 };
    for (const h of all) if (h.satellite && h.satellite in c) c[h.satellite]++;
    return c;
  }, [live.data]);

  const items: { label: string; value: string; tone: Tone }[] = [
    ...(['Terra', 'Aqua', 'NOAA-20', 'NOAA-21'] as const).map((name) => ({
      label: `${name} · ${name.startsWith('NOAA') ? 'VIIRS' : 'MODIS'}`,
      value:
        live.status === 'loading' ? 'checking…' : live.status === 'error' ? 'feed unavailable' : counts[name] > 0 ? `live · ${counts[name].toLocaleString()} in 24 h` : 'no detections in 24 h',
      tone: (live.status === 'ready' && counts[name] > 0 ? 'live' : 'idle') as Tone,
    })),
    { label: 'Suomi-NPP · VIIRS', value: 'retired Nov 2026 · archive only', tone: 'retired' },
    { label: 'Archive', value: meta ? `${fmtMonth(meta.range.start)} – ${fmtMonth(meta.range.end)} · ${(meta.totals.detections / 1e6).toFixed(2)}M detections` : '…', tone: 'info' },
    { label: 'Static heat mask', value: meta ? `${meta.staticMask.sources.toLocaleString()} sources filtered` : '…', tone: 'info' },
    { label: 'Harmonization', value: 'VIIRS → MODIS-equivalent fire cell-days', tone: 'info' },
  ];

  return (
    <section aria-label={`Satellite telemetry${live.data ? `, ${live.data.date}` : ''}`} className="ticker relative overflow-hidden bg-karhutla-smoke text-white" tabIndex={0}>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center bg-gradient-to-r from-karhutla-smoke via-karhutla-smoke to-transparent pl-5 pr-10 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
        Live
      </div>
      {/* Two copies side by side; the track slides by half its width for a seamless loop. */}
      <div className="ticker-track flex w-max" style={{ ['--ticker-duration' as string]: '55s' }}>
        <ul className="flex">{items.map((it) => <TickerItem key={it.label} {...it} />)}</ul>
        <ul className="flex" aria-hidden>{items.map((it) => <TickerItem key={`dup-${it.label}`} {...it} />)}</ul>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-karhutla-smoke to-transparent" />
    </section>
  );
}

/** Raw detections vs harmonized cell-days per year, each indexed to its 2001–2011 mean = 100. */
function HarmonizationChart() {
  const [months, setMonths] = useState<MonthRecord[] | null>(null);
  const { ref, inView } = useInView<HTMLElement>(0.4, { repeat: true });
  const [hover, setHover] = useState<number | null>(null);
  const [show, setShow] = useState({ raw: true, har: true });
  useEffect(() => {
    fetchRegionCalendar('indonesia').then((c) => setMonths(c.variants.masked.months)).catch(() => setMonths(null));
  }, []);
  const series = useMemo(() => {
    if (!months) return null;
    const years = Array.from({ length: 2025 - 2001 + 1 }, (_, i) => 2001 + i);
    const sum = (y: number, k: 'rawPoints' | 'harmonized') => months.filter((m) => m.year === y).reduce((s, m) => s + (m[k] ?? 0), 0);
    const raw = years.map((y) => sum(y, 'rawPoints'));
    const har = years.map((y) => sum(y, 'harmonized'));
    const base = (a: number[]) => a.slice(0, 11).reduce((s, v) => s + v, 0) / 11;
    const rb = base(raw);
    const hb = base(har);
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return {
      years,
      raw: raw.map((v) => (v / rb) * 100),
      har: har.map((v) => (v / hb) * 100),
      rawJump: med(raw.slice(11)) / med(raw.slice(0, 11)),
      harJump: med(har.slice(11)) / med(har.slice(0, 11)),
    };
  }, [months]);

  if (!series) return <div className="h-28 rounded-[4px] bg-black/[0.04]" aria-hidden />;
  const w = 300;
  const h = 110;
  const max = Math.max(...(show.raw ? series.raw : []), ...(show.har ? series.har : []), 100);
  const x = (i: number) => (i / (series.years.length - 1)) * w;
  const y = (v: number) => h - (v / max) * (h - 6);
  const path = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const x2012 = x(2012 - 2001);
  const n = series.years.length;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setHover((cur) => Math.max(0, Math.min(n - 1, (cur ?? n - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
    }
  };
  const i = hover ?? n - 1;
  const toggle = (k: 'raw' | 'har') => setShow((s) => (s[k] && !s[k === 'raw' ? 'har' : 'raw'] ? s : { ...s, [k]: !s[k] }));
  return (
    <figure ref={ref} className={cn('chart-draw', inView && 'is-visible')}>
      {/* Readout for the year under the pointer (or the latest year). */}
      <div className="mb-2 flex items-baseline justify-between gap-3 font-mono text-[11px] tabular-nums text-neutral-800">
        <span className="text-[13px] font-bold text-neutral-950">{series.years[i]}</span>
        <span className="flex gap-3">
          {show.raw && <span>raw <b className="text-neutral-950">{Math.round(series.raw[i])}</b></span>}
          {show.har && <span className="text-accent-800">harm. <b>{Math.round(series.har[i])}</b></span>}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-28 w-full cursor-crosshair touch-none overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-accent-600/60"
        role="img"
        tabIndex={0}
        aria-label={`Indonesia 2001–2025, indexed to the 2001–2011 mean of 100: raw detection counts jump ${series.rawJump.toFixed(1)}× after VIIRS arrives in 2012; the harmonized series changes ${series.harJump.toFixed(1)}×. Use the arrow keys to step through years.`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        <rect x={x2012} y={0} width={w - x2012} height={h} fill="rgba(158,67,36,0.06)" />
        <line x1={x2012} x2={x2012} y1={0} y2={h} stroke="rgba(23,23,23,0.35)" strokeDasharray="3 3" />
        <text x={x2012 + 4} y={10} fontSize="9" fill="rgba(23,23,23,0.7)" fontFamily="JetBrains Mono, monospace">VIIRS 2012</text>
        <line x1={0} x2={w} y1={y(100)} y2={y(100)} stroke="rgba(23,23,23,0.15)" />
        <path data-draw="1" pathLength={1} d={path(series.raw)} fill="none" stroke="#525252" strokeWidth="1.5" className={cn('transition-opacity duration-300', !show.raw && 'opacity-0')} />
        <path data-draw="2" pathLength={1} d={path(series.har)} fill="none" stroke="#9e4324" strokeWidth="2.25" className={cn('transition-opacity duration-300', !show.har && 'opacity-0')} />
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(i)} x2={x(i)} y1={0} y2={h} stroke="rgba(23,23,23,0.45)" />
            {show.raw && <circle cx={x(i)} cy={y(series.raw[i])} r={3.2} fill="#fff" stroke="#525252" strokeWidth={1.5} />}
            {show.har && <circle cx={x(i)} cy={y(series.har[i])} r={3.6} fill="#9e4324" stroke="#fff" strokeWidth={1.2} />}
          </g>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-800">
        <button type="button" aria-pressed={show.raw} onClick={() => toggle('raw')} className={cn('flex items-center gap-1.5 rounded-[4px] border px-2 py-1 transition-colors', show.raw ? 'border-neutral-900/25 bg-white/60' : 'border-transparent opacity-55 hover:opacity-90')}>
          <span className="h-0.5 w-3 bg-neutral-600" /> Raw ×{series.rawJump.toFixed(1)} after 2012
        </button>
        <button type="button" aria-pressed={show.har} onClick={() => toggle('har')} className={cn('flex items-center gap-1.5 rounded-[4px] border px-2 py-1 transition-colors', show.har ? 'border-accent-800/35 bg-white/60' : 'border-transparent opacity-55 hover:opacity-90')}>
          <span className="h-0.5 w-3 bg-accent-700" /> Harmonized ×{series.harJump.toFixed(1)}
        </button>
      </figcaption>
    </figure>
  );
}

/** National percentile for a score, interpolated between the published quantiles (index.json). */
function percentileOf(score: number, q: Record<string, number>): number {
  const pts: [number, number][] = [[0, 0], ...Object.entries(q).map(([p, v]) => [v, Number(p) * 100] as [number, number]).sort((a, b) => a[0] - b[0]), [100, 100]];
  for (let k = 1; k < pts.length; k++) {
    const [s0, p0] = pts[k - 1];
    const [s1, p1] = pts[k];
    if (score <= s1) return p0 + ((score - s0) / Math.max(1e-6, s1 - s0)) * (p1 - p0);
  }
  return 100;
}

const FEATURES: { key: keyof ForensicIndex['weights']; label: string; note: string; color: string }[] = [
  // Definitions follow pipeline/forensics.py.
  { key: 'recurrence', label: 'Recurrence', note: 'Active years, and 3–5 year gaps between burns', color: '#612c25' },
  { key: 'offSeason', label: 'Off-season', note: 'Detections in the province’s low-fire months', color: '#9e4324' },
  { key: 'geometry', label: 'Geometry', note: 'How line-shaped a day’s VIIRS detections are', color: '#c67438' },
  { key: 'timing', label: 'Afternoon timing', note: 'Afternoon-pass share, ranked within the province', color: '#e69430' },
];

function SignatureScale() {
  const [idx, setIdx] = useState<ForensicIndex | null>(null);
  const { ref, inView } = useInView<HTMLDivElement>(0.4, { repeat: true });
  const [score, setScore] = useState<number | null>(null);
  const [feature, setFeature] = useState<number | null>(null);
  useEffect(() => {
    fetchForensicIndex().then(setIdx).catch(() => setIdx(null));
  }, []);
  if (!idx) return <div className="h-28 rounded-[4px] bg-black/[0.04]" aria-hidden />;
  const q = idx.scoreQuantiles;
  const marks: [string, number][] = [['median', q['0.5']], ['p90', q['0.9']], ['p99', q['0.99']]];
  const w = idx.weights;
  const s = score ?? Math.round(q['0.9']);
  const pct = percentileOf(s, q);
  const f = feature === null ? null : FEATURES[feature];
  return (
    <div ref={ref} className={cn('slide-marks', inView && 'is-visible')}>
      <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums text-neutral-800">
        <span>Try a score</span>
        <span>
          <b className="text-[13px] text-neutral-950">{s}</b> → above <b className="text-accent-800">{pct >= 99.5 ? '99+' : Math.round(pct)}%</b> of cells
        </span>
      </div>
      <div className="relative mt-7 h-2 rounded-[1px] bg-black/[0.08]">
        <div data-fill className="absolute inset-0 rounded-[1px]" style={{ background: 'linear-gradient(90deg, #f1cb98, #e69430, #c67438, #9e4324, #612c25)' }} />
        {marks.map(([label, v], i) => (
          <div key={label} data-mark className="pointer-events-none absolute -top-6 text-center" style={{ left: `${v}%`, ['--i' as string]: i }}>
            <span className="block font-mono text-[11px] text-neutral-800">{label}</span>
            <span className="mx-auto mt-0.5 block h-5 w-px bg-neutral-900" />
          </div>
        ))}
        {/* The draggable score: a native range input on top, so touch and keyboard work too. */}
        <span aria-hidden className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-karhutla-char shadow-[0_0_0_4px_rgba(158,67,36,0.22)] transition-[left] duration-75" style={{ left: `${s}%` }} />
        <input
          type="range"
          min={0}
          max={100}
          value={s}
          onChange={(e) => setScore(Number(e.target.value))}
          aria-label="Signature score to compare against Indonesian fire cells"
          aria-valuetext={`Score ${s}, above ${Math.round(pct)} percent of cells`}
          className="absolute -inset-y-3 inset-x-0 w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-neutral-700"><span>0</span><span>100</span></div>
      {/* Feature weights as one stacked bar; hover or focus a feature to read it. */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-[1px]" aria-hidden>
        {FEATURES.map((ft, k) => (
          <span key={ft.key} className="h-full transition-opacity duration-200" style={{ width: `${w[ft.key] * 100}%`, background: ft.color, opacity: feature === null || feature === k ? 1 : 0.25 }} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-neutral-800" onMouseLeave={() => setFeature(null)}>
        {FEATURES.map((ft, k) => (
          <li key={ft.key}>
            <button
              type="button"
              onMouseEnter={() => setFeature(k)}
              onFocus={() => setFeature(k)}
              onBlur={() => setFeature(null)}
              className={cn('flex w-full items-center gap-1.5 rounded-[3px] px-1 py-0.5 text-left transition-colors', feature === k ? 'bg-white/70' : 'hover:bg-white/50')}
            >
              <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: ft.color }} />
              {ft.label} · {Math.round(w[ft.key] * 100)}%
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 min-h-[1.25rem] font-mono text-[11px] text-neutral-700">{f ? f.note : 'A score for ranking field checks, not a probability.'}</p>
    </div>
  );
}

/** [label, tag for simulated parts (CLAUDE.md: escrow, payments, SMS bot, P2P board)] */
const BRANCHES: [string, string | null][] = [
  ['Satellite escrow + real VIIRS overpass timer', 'Simulated escrow'],
  ['Citizen ground-truth via SMS / WhatsApp', 'Simulated'],
  ['Downwind haze shield: live wind + OSM schools', null],
  ['Evidence dossier + P2P logistics', 'P2P demo'],
];

function ImpactLoop() {
  const { ref, inView } = useInView<HTMLUListElement>(0.4, { repeat: true });
  // One branch is lit at a time and the light walks the loop every 3 s; hover takes over.
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!inView || held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setActive((a) => (a + 1) % BRANCHES.length), 3000);
    return () => window.clearInterval(t);
  }, [inView, held]);
  return (
    <ul ref={ref} className="space-y-1" onMouseLeave={() => setHeld(false)}>
      {BRANCHES.map(([label, sim], i) => (
        <li
          key={label}
          onMouseEnter={() => {
            setHeld(true);
            setActive(i);
          }}
          className={cn(
            'relative flex items-center gap-2 overflow-hidden rounded-[4px] px-1.5 py-1 text-[12px] text-neutral-900 transition-all duration-500',
            inView ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0',
            active === i ? 'bg-white/70' : 'bg-transparent',
          )}
          style={{ transitionDelay: inView ? `${i * 110}ms` : '0ms' }}
        >
          {active === i && !held && inView && <span key={`p-${active}`} aria-hidden className="loop-progress absolute inset-x-0 bottom-0 h-px origin-left bg-accent-700" />}
          <span className={cn('font-mono text-[11px] transition-colors', active === i ? 'text-accent-800' : 'text-neutral-700')}>0{i + 1}</span>
          <span className="min-w-0 flex-1">{label}</span>
          {sim && <span className="shrink-0 rounded-[2px] border border-[#5b3fa3]/40 bg-white/50 px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#4c3591]">{sim}</span>}
        </li>
      ))}
      <li className="pt-1 text-xs leading-5 text-neutral-800">Payments, messaging and the P2P board are labelled simulations in the app.</li>
    </ul>
  );
}

export function FeaturePreviews({ onOpen }: { onOpen: (path: string) => void }) {
  const cards = [
    {
      icon: GitMerge,
      kicker: 'Harmonization engine',
      title: 'One record from two sensor generations',
      body: 'VIIRS sees about four times more fire pixels than MODIS. Artemis scales VIIRS to MODIS-equivalent fire cell-days, so 2001 compares with 2026.',
      visual: <HarmonizationChart />,
      cta: ['Open the burning calendar', '/dashboard'],
    },
    {
      icon: Fingerprint,
      kicker: 'Forensic signature',
      title: 'Anthropogenic thermal signature score',
      body: 'Four rule-based features from 26 years of detections in each ~5 km² cell. A score for prioritising field checks, not a probability or a finding.',
      visual: <SignatureScale />,
      cta: ['Inspect a hotspot', '/dashboard'],
    },
    {
      icon: HandHeart,
      kicker: '4-branch impact loop',
      title: 'Every hotspot leads to an action',
      body: 'From any detection: fund prevention, collect ground truth, warn schools downwind, or file a neutral evidence dossier.',
      visual: <ImpactLoop />,
      cta: ['Try the EUDR audit', '/audit?demo=b'],
    },
  ];

  return (
    <section id="platform" data-embers-from data-header-tone="light" className="thermal-field grain relative scroll-mt-[4.25rem] overflow-hidden">
      <div className="relative z-[2] mx-auto max-w-[1440px] px-5 pb-20 pt-24 sm:px-8 lg:pb-28 lg:pt-28">
        <SectionRule index="02" label="Inside Artemis" />
        <div className="mb-8 mt-10 max-w-3xl">
          <h2 data-split className="mt-3 font-display text-2xl font-bold leading-[1.15] text-neutral-950 sm:text-4xl">
            Built on the <span className="text-karhutla-char">real</span> archive
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {cards.map(({ icon: Icon, kicker, title, body, visual, cta }) => (
            <LiquidGlass key={kicker} radius={14} className="min-h-[26rem]" contentClassName="flex flex-col p-5">
              <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-800">
                <Icon className="h-3.5 w-3.5" /> {kicker}
              </div>
              <h3 className="mt-3 font-display text-base font-bold leading-snug text-neutral-950 sm:text-lg">{title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-neutral-800">{body}</p>
              <div className="mt-5 flex-1 rounded-[6px] border border-black/10 bg-white/45 p-4">{visual}</div>
              <button
                type="button"
                onClick={() => onOpen(cta[1])}
                className="mt-4 inline-flex items-center gap-2 self-start font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-900 underline-offset-4 hover:underline"
              >
                {cta[0]} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </LiquidGlass>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Live tuning for the hero globe and glass, shown only with /?tune=1. */
export function TuningPanel({ earth, onEarth }: { earth: EarthTuning; onEarth: (t: EarthTuning) => void }) {
  const [blur, setBlur] = useState(DEFAULT_GLASS.blurRadius);
  const [tint, setTint] = useState(DEFAULT_GLASS.tintOpacity);
  const row = (label: string, value: number, min: number, max: number, step: number, set: (v: number) => void) => (
    <label className="block">
      <span className="flex justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-white/70">
        {label} <span className="tabular-nums text-white">{value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-[#d9831c]" />
    </label>
  );
  return (
    <aside className="fixed bottom-4 right-4 z-[2500] w-64 space-y-3 rounded-[6px] border border-white/15 bg-black/85 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Tuning
      </div>
      {row('Globe spin (rad/s)', earth.spin, 0, 0.3, 0.005, (v) => onEarth({ ...earth, spin: v }))}
      {row('Pointer lean', earth.tiltFollow, 0, 0.6, 0.02, (v) => onEarth({ ...earth, tiltFollow: v }))}
      {row('Glass blur', blur, 1, 15, 0.5, (v) => { setBlur(v); void setGlassParams({ blurRadius: v }); })}
      {row('Glass tint', tint, 0, 0.8, 0.02, (v) => { setTint(v); void setGlassParams({ tintOpacity: v }); })}
      <p className="text-[11px] leading-4 text-white/60">Tell me the values you like and I will make them the defaults.</p>
    </aside>
  );
}
