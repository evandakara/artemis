import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, HeartHandshake, PiggyBank, Satellite } from 'lucide-react';

import { DonationWidget } from '@/components/DonationWidget';
import { MONTH_LABELS } from '@/data/historyApi';
import { formatCountdown, predictNextPasses, SWATH_EDGE_ELEVATION_DEG, type PassPrediction } from '@/data/passApi';
import { readLocal, writeLocal } from '@/lib/localStore';
import { cn } from '@/lib/utils';
import type { HubContext } from './hubContext';
import { btnGhost, btnPrimary, InfoTip, LiveTag, Panel, SimTag, SubHead } from './shared';

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const TRIGGER_Z = 1.5;
const LEAD_DAYS = 21;

interface Pledge {
  at: string;
  amount: number;
  kind: 'retainer' | 'csr';
}

const ACTIONS = [
  {
    id: 'pledge',
    label: 'Pledge to the pool',
    Icon: PiggyBank,
    blurb: 'Fund prevention before fires start. Pledges pay local communities for keeping high-risk weeks fire-free.',
  },
  {
    id: 'groups',
    label: 'Donate to groups',
    Icon: HeartHandshake,
    blurb: 'Give directly to organizations fighting fire near this spot. Each card links to the group’s own donation page.',
  },
] as const;

const fmtTime = (d: Date) => `${d.toISOString().slice(11, 16)} UTC`;

function OverpassPanel({ lat, lng }: { lat: number; lng: number }) {
  const [passes, setPasses] = useState<PassPrediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    predictNextPasses(lat, lng)
      .then((p) => !cancelled && setPasses(p))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Orbit data unavailable.'));
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Recompute once the soonest pass has ended; one request at a time.
  const refreshing = useRef(false);
  useEffect(() => {
    if (refreshing.current || !passes?.[0] || passes[0].end.getTime() >= now) return;
    refreshing.current = true;
    predictNextPasses(lat, lng)
      .then(setPasses)
      .catch(() => undefined)
      .finally(() => {
        refreshing.current = false;
      });
  }, [now, passes, lat, lng]);

  return (
    <Panel
      title="Next satellite pass"
      tag={
        <LiveTag
          info={
            <>
              Predicted from real NOAA-20 and NOAA-21 orbits (CelesTrak{passes?.[0] ? `, ${passes[0].tleEpoch.toISOString().slice(0, 10)}` : ''}). A pass counts when the satellite rises above {SWATH_EDGE_ELEVATION_DEG}°, roughly the edge of the 3,040 km VIIRS swath. Night passes see smouldering peat best.
            </>
          }
        >
          Real orbit
        </LiveTag>
      }
    >
      {error && <p className="text-sm text-[#fca5a5]">Could not compute passes: {error}</p>}
      {!passes && !error && <p className="text-sm text-white/55">Working out the next passes…</p>}
      {passes && passes.length === 0 && <p className="text-sm text-white/60">No pass in the next 36 hours.</p>}
      {passes && passes.length > 0 && (
        <ul className="grid gap-px overflow-hidden rounded-[4px] border border-white/[0.1] bg-white/[0.08] sm:grid-cols-2">
          {passes.map((p, i) => {
            const toPeak = p.peak.getTime() - now;
            const inPass = p.start.getTime() <= now && p.end.getTime() >= now;
            return (
              <li key={p.satellite} className="bg-[#0d0d0d] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85">
                    <Satellite className="h-3.5 w-3.5 text-white/60" /> {p.satellite}
                  </span>
                  {i === 0 && <span className="rounded-[3px] bg-accent-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-accent-200">Soonest</span>}
                </div>
                <p className={cn('mt-2 font-mono text-2xl font-bold tabular-nums', inPass ? 'text-[#6ee7b7]' : 'text-white')} aria-live={i === 0 ? 'off' : undefined}>
                  {inPass ? 'Overhead now' : formatCountdown(toPeak)}
                </p>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-white/55">
                  {fmtTime(p.peak)} · {p.dayNight === 'N' ? 'night' : 'day'} pass
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function PreIgnitionPanel({ ctx }: { ctx: HubContext }) {
  const info = useMemo(() => {
    if (!ctx.baseline) return null;
    const medians = Array.from({ length: 12 }, (_, i) => ctx.baseline?.[String(i + 1)]?.median ?? 0);
    const max = Math.max(...medians, 1);
    const ranked = medians.map((v, i) => ({ month: i + 1, v })).sort((a, b) => b.v - a.v);
    const peak = new Set(ranked.slice(0, 3).filter((r) => r.v > 0).map((r) => r.month));
    const ahead = new Date(Date.now() + LEAD_DAYS * 86_400_000);
    const nowMonth = new Date().getUTCMonth() + 1;
    return {
      heights: medians.map((v) => v / max),
      peak,
      aheadMonth: ahead.getUTCMonth() + 1,
      entering: !peak.has(nowMonth) && peak.has(ahead.getUTCMonth() + 1),
      inPeak: peak.has(nowMonth),
    };
  }, [ctx.baseline]);
  const z = ctx.monthRecord?.z ?? null;
  const triggered = z !== null && z >= TRIGGER_Z;

  return (
    <Panel
      title="Prevention pool"
      info={
        <>
          Funds are released {LEAD_DAYS} days before {ctx.calendarRegion.name}&apos;s three busiest fire months (by the 2001–2025 median) for canal blocking and school masks. The pool also pays out automatically when a month&apos;s anomaly reaches +{TRIGGER_Z}σ.
        </>
      }
      tag={<LiveTag>Archive 2001–2025</LiveTag>}
    >
      {ctx.archive === 'outside' ? (
        <p className="text-[12px] leading-5 text-white/60">
          No fire calendar for {ctx.country ?? 'this country'} yet: the 26-year harmonized archive covers Indonesia only. Live detections here still work.
        </p>
      ) : !info ? (
        <p className="text-sm text-white/55">Reading the {ctx.calendarRegion.name} fire calendar…</p>
      ) : (
        <>
          <div className="flex h-14 items-end gap-1" role="img" aria-label={`Typical fire activity by month. Peak months: ${[...info.peak].map((m) => MONTH_LABELS[m - 1]).join(', ')}`}>
            {MONTH_LABELS.map((label, i) => (
              <div key={label} className="flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className={cn('bar-grow w-full rounded-t-[2px]', info.peak.has(i + 1) ? 'bg-[#fdba74]' : 'bg-white/[0.12]', i + 1 === info.aheadMonth && 'ring-1 ring-white/60')}
                  style={{ height: `${Math.max(8, info.heights[i] * 100)}%`, animationDelay: `${i * 35}ms` }}
                />
                <span className={cn('mt-1 font-mono text-[9px]', info.peak.has(i + 1) ? 'text-[#fdba74]' : 'text-white/45')}>{label[0]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-5 text-white/70">
            {info.entering ? (
              <>
                <strong className="text-[#fdba74]">Fire season starts within {LEAD_DAYS} days.</strong> Prevention funds should go out now.
              </>
            ) : info.inPeak ? (
              <strong className="text-[#fdba74]">Inside fire season now.</strong>
            ) : (
              `Quiet period: no fire season in the next ${LEAD_DAYS} days.`
            )}
          </p>
          <div className={cn('mt-2 flex items-center justify-between gap-2 rounded-[4px] border px-3 py-2 text-[12px]', triggered ? 'border-[#fca5a5]/35 bg-[#fca5a5]/[0.07]' : 'border-white/[0.1]')}>
            <span className="text-white/65">Automatic payout (anomaly ≥ +{TRIGGER_Z}σ)</span>
            <span className={cn('font-mono text-[11px] font-semibold uppercase tracking-[0.08em]', triggered ? 'text-[#fca5a5]' : 'text-white/75')}>
              {triggered ? 'Triggered' : 'Not triggered'}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

type StepState = 'done' | 'active' | 'pending';

/** Horizontal three-step escrow tracker; the connecting line fills up to the furthest active step. */
function EscrowStepper({ steps }: { steps: { title: string; status: string; state: StepState; info: React.ReactNode }[] }) {
  const reached = steps.reduce((n, s, i) => (s.state !== 'pending' ? i : n), 0);
  return (
    <ol className="relative grid grid-cols-3 gap-2 pt-1">
      <span className="absolute left-[16.66%] right-[16.66%] top-[17px] h-[2px] bg-white/[0.1]" aria-hidden />
      <span
        className="meter-fill absolute left-[16.66%] top-[17px] h-[2px] bg-gradient-to-r from-[#6ee7b7] to-accent-400"
        style={{ width: `${(reached / (steps.length - 1)) * 66.67}%` }}
        aria-hidden
      />
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex flex-col items-center text-center">
          <span
            className={cn(
              'pop-in relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 font-mono text-[11px] font-bold',
              s.state === 'done' && 'border-[#6ee7b7] bg-[#6ee7b7] text-black',
              s.state === 'active' && 'border-accent-400 bg-[#1a1209] text-accent-200 shadow-[0_0_0_4px_rgba(217,131,28,0.15)]',
              s.state === 'pending' && 'border-white/20 bg-[#111] text-white/45',
            )}
            style={{ animationDelay: `${150 + i * 120}ms` }}
          >
            {s.state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
          </span>
          <p className={cn('mt-2 flex items-center gap-1 text-[12px] font-semibold leading-4', s.state === 'pending' ? 'text-white/60' : 'text-white/90')}>
            {s.title}
            <InfoTip label={`About step ${i + 1}`}>{s.info}</InfoTip>
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-white/55">{s.status}</p>
        </li>
      ))}
    </ol>
  );
}

function PledgeFlow({ poolKey, onPledged }: { poolKey: string; onPledged: () => void }) {
  const [kind, setKind] = useState<Pledge['kind']>('retainer');
  const [amount, setAmount] = useState(100_000);
  const [stage, setStage] = useState<'choose' | 'code' | 'done'>('choose');
  const presets = kind === 'retainer' ? [50_000, 100_000, 500_000] : [10_000_000, 50_000_000, 250_000_000];

  const confirm = () => {
    const pledges = readLocal<Pledge[]>(poolKey, []);
    writeLocal(poolKey, [...pledges, { at: new Date().toISOString(), amount, kind }]);
    setStage('done');
    onPledged();
  };

  return (
    <div>
      <SubHead
        right={
          <SimTag
            info="A walkthrough only: no payment is made and no real QRIS code is created. In a real launch this step would go through a licensed payment gateway. Pledges are saved in this browser only."
          />
        }
      >
        Who is pledging?
      </SubHead>
      <fieldset className="mt-2.5">
        <legend className="sr-only">Who is pledging</legend>
        <div className="grid grid-cols-2 gap-1 rounded-[6px] border border-white/[0.12] bg-[#0b0b0b] p-1">
          {(['retainer', 'csr'] as const).map((k) => (
            <label key={k} className={cn('cursor-pointer rounded-[4px] px-2.5 py-1.5 text-center text-[12px] transition-colors', kind === k ? 'bg-white/[0.1] text-white' : 'text-white/60 hover:text-white/85')}>
              <input type="radio" name="pledge-kind" className="sr-only" checked={kind === k} onChange={() => { setKind(k); setAmount(k === 'retainer' ? 100_000 : 50_000_000); setStage('choose'); }} />
              <span className="font-semibold">{k === 'retainer' ? 'Individual' : 'Company'}</span>
              <span className="ml-1 text-[11px] text-white/45">{k === 'retainer' ? 'QRIS' : 'CSR'}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Amount">
        {presets.map((p) => (
          <button key={p} type="button" aria-pressed={amount === p} onClick={() => { setAmount(p); setStage('choose'); }} className={cn(btnGhost, 'px-1.5 normal-case tracking-normal', amount === p && 'border-accent-400/60 bg-accent-500/10 text-accent-200')}>
            {idr.format(p).replace(/\s/g, ' ')}
          </button>
        ))}
      </div>
      {stage === 'choose' && (
        <button type="button" className={cn(btnPrimary, 'cta-glow mt-3 w-full py-2.5')} onClick={() => setStage('code')}>
          Continue
        </button>
      )}
      {stage === 'code' && (
        <div className="msg-in mt-2.5 flex items-center gap-3">
          <div className="relative grid h-20 w-20 shrink-0 grid-cols-8 gap-[2px] overflow-hidden rounded-[4px] border border-white/[0.14] bg-white/[0.04] p-1.5" aria-label="Placeholder pattern, not a payment code" role="img">
            {Array.from({ length: 64 }, (_, i) => (
              <span key={i} className={((i * 37 + amount / 1000) % 5) < 2 ? 'bg-white/35' : 'bg-transparent'} />
            ))}
            <span className="absolute inset-0 flex rotate-[-20deg] items-center justify-center font-mono text-[11px] font-bold tracking-[0.2em] text-[#c4b5fd]">DEMO</span>
          </div>
          <div className="min-w-0">
            <p className="text-[12px] leading-5 text-white/70">{idr.format(amount)} to the {kind === 'retainer' ? 'prevention' : 'company protection'} pool</p>
            <button type="button" className={cn(btnPrimary, 'mt-1.5')} onClick={confirm}>
              Record pledge
            </button>
          </div>
        </div>
      )}
      {stage === 'done' && (
        <p className="pop-in mt-2.5 flex items-center gap-1.5 text-[12px] text-[#6ee7b7]">
          <Check className="h-3.5 w-3.5" /> Pledge recorded.{' '}
          <button type="button" className="text-white/60 underline decoration-dotted underline-offset-2 hover:text-white" onClick={() => setStage('choose')}>
            Add another
          </button>
        </p>
      )}
    </div>
  );
}

export function EscrowTab({ ctx, onViewLocation }: { ctx: HubContext; onViewLocation?: (lat: number, lng: number, zoom: number) => void }) {
  const poolKey = `artemis:pool:${ctx.calendarRegion.id}`;
  const [pool, setPool] = useState<Pledge[]>(() => readLocal<Pledge[]>(poolKey, []));
  useEffect(() => setPool(readLocal<Pledge[]>(poolKey, [])), [poolKey]);
  const total = pool.reduce((s, p) => s + p.amount, 0);
  const live = ctx.target.live;
  const verified = !!live && live.confidence >= 50;
  const [action, setAction] = useState<'pledge' | 'groups'>('pledge');

  const steps = [
    {
      title: 'Pool funded',
      state: (total > 0 ? 'done' : 'active') as StepState,
      status: total > 0 ? `${idr.format(total)} · ${pool.length} pledge${pool.length === 1 ? '' : 's'}` : 'Waiting for pledges',
      info: `The ${ctx.calendarRegion.name} protection pool. Retainers pay communities for keeping high-risk weeks fire-free; nothing is paid for a detected fire.`,
    },
    {
      title: '50% supplies',
      state: (verified ? 'active' : 'pending') as StepState,
      status: verified ? 'Unlocked by a live detection' : 'Locked: no live fire here',
      info: verified
        ? `A live ${live?.satellite ?? live?.source} detection (${live?.confidence}% confidence, ${live?.frp.toFixed(1)} MW) unlocks audited supply credits (fuel, pump parts, N95 masks) for the nearest village fire patrol (MPA). Credits, not cash.`
        : 'Opens only when a satellite confidently detects a live fire here. Then the nearest village fire patrol (MPA) gets supply credits for fuel, pump parts and masks. Credits, not cash.',
    },
    {
      title: '100% fire out',
      state: 'pending' as StepState,
      status: 'Next pass must read 0 MW',
      info: 'The rest is released when the next VIIRS pass reads 0 MW at this spot. Donors then get a before/after heat receipt. The patrol still has to confirm on the ground.',
    },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title="Proof-of-extinguish escrow"
        tag={<SimTag info="A simulated escrow to show the idea: no money moves. Pledges are saved in this browser only." />}
        bodyClassName="pt-6 pb-4"
      >
        <EscrowStepper steps={steps} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <OverpassPanel lat={ctx.target.lat} lng={ctx.target.lng} />
          <PreIgnitionPanel ctx={ctx} />
        </div>

        <Panel
          title={
            <span className="flex items-center gap-1.5 text-accent-200">
              <HeartHandshake className="h-3.5 w-3.5" aria-hidden /> Take action
            </span>
          }
          className="action-glow lg:h-0 lg:min-h-full"
          bodyClassName="flex min-h-0 flex-col gap-3"
        >
          <div role="tablist" aria-label="Ways to help" className="grid grid-cols-2 gap-1 rounded-[6px] border border-white/[0.12] bg-[#0b0b0b] p-1">
            {ACTIONS.map(({ id, label, Icon }) => (
              <button
                key={`${id}-${action === id}`}
                type="button"
                role="tab"
                aria-selected={action === id}
                aria-controls={`action-${id}`}
                onClick={() => setAction(id)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-[4px] px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors',
                  action === id ? 'action-ping bg-accent-500 text-black' : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <p key={`blurb-${action}`} className="tab-panel-in border-l-2 border-accent-400/70 pl-2.5 text-[12px] leading-5 text-white/75">
            {ACTIONS.find((a) => a.id === action)?.blurb}
          </p>
          {action === 'pledge' ? (
            <div key="pledge" id="action-pledge" role="tabpanel" className="tab-panel-in lg:min-h-0 lg:overflow-y-auto">
              <PledgeFlow poolKey={poolKey} onPledged={() => setPool(readLocal<Pledge[]>(poolKey, []))} />
            </div>
          ) : (
            <div key="groups" id="action-groups" role="tabpanel" className="tab-panel-in flex min-h-0 flex-1 flex-col">
              <SubHead info="Links open each organization's own page. Village fire brigades (Masyarakat Peduli Api) are the local first responders but take no public donations.">
                Groups fighting fire nearby
              </SubHead>
              <div className="mt-2 flex min-h-0 flex-1 flex-col">
                <DonationWidget
                  lat={ctx.target.lat}
                  lng={ctx.target.lng}
                  province={ctx.forensic.data?.province ?? (ctx.archive === 'covered' && ctx.calendarRegion.id !== 'indonesia' ? ctx.calendarRegion.name : null)}
                  currentLocation={ctx.calendarRegion.name}
                  onViewLocation={onViewLocation}
                />
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
