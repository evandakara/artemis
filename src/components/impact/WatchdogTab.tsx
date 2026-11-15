import { useEffect, useState, type FormEvent } from 'react';
import { Check, FileDown, FileText, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';

import { collectDetections, dossierCsv, dossierHtml, type DossierInput } from '@/lib/dossier';
import { downloadText } from '@/lib/csvExport';
import { readLocal, writeLocal } from '@/lib/localStore';
import { cn } from '@/lib/utils';
import type { FireHotspot } from '@/types';
import { DOSSIER_PERCENTILE, type HubContext } from './hubContext';
import { btnGhost, btnPrimary, LiveTag, Panel, SimTag } from './shared';

interface Need {
  id: string;
  label: string;
  status: 'needed' | 'pledged';
}

const DEFAULT_NEEDS: Omit<Need, 'id'>[] = [
  { label: '2× high-pressure water pumps', status: 'needed' },
  { label: '15 boxes of N95 masks', status: 'needed' },
  { label: 'Thermal drone operator (1 day)', status: 'needed' },
  { label: '200 L pump fuel', status: 'needed' },
  { label: 'Field first-aid kits', status: 'needed' },
];
/** Older saved boards may hold a third "delivered" state; it reads as pledged. */
const normalize = (needs: Need[]): Need[] => needs.map((n) => (n.status === 'needed' ? n : { ...n, status: 'pledged' }));

function DossierPanel({ ctx, liveHotspots }: { ctx: HubContext; liveHotspots: FireHotspot[] }) {
  const f = ctx.forensic.data;
  const unlocked = !!f && f.percentile >= DOSSIER_PERCENTILE;
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = (): DossierInput | null =>
    f
      ? {
          lat: ctx.target.lat, lng: ctx.target.lng, cell: ctx.target.cell, place: ctx.place,
          regionId: ctx.calendarRegion.id, regionName: ctx.calendarRegion.name, forensic: f, months: ctx.months, liveHotspots,
        }
      : null;

  const makePdf = async () => {
    const data = input();
    if (!data) return;
    // Open the window inside the click so popup blockers allow it, then fill it.
    const win = window.open('', '_blank');
    if (!win) {
      setError('The browser blocked the report window. Allow pop-ups for this site and try again.');
      return;
    }
    win.document.write('<p style="font:14px system-ui;padding:24px">Building dossier…</p>');
    setBusy('pdf');
    setError(null);
    try {
      const { rows, archiveYear } = await collectDetections(data);
      win.document.open();
      win.document.write(dossierHtml(data, rows, archiveYear));
      win.document.close();
    } catch (e: unknown) {
      win.close();
      setError(e instanceof Error ? e.message : 'Could not build the dossier.');
    } finally {
      setBusy(null);
    }
  };

  const makeCsv = async () => {
    const data = input();
    if (!data) return;
    setBusy('csv');
    setError(null);
    try {
      const { rows } = await collectDetections(data);
      downloadText(`artemis_dossier_${data.cell}.csv`, dossierCsv(data, rows));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not build the CSV.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Civic watchdog dossier"
      info={
        <>
          A neutral evidence file for Gakkum KLHK or SP4N-LAPOR!: coordinates, the 20-year anomaly record, detections and the four signature features. It reports observations, never who started a fire. It unlocks for the top {100 - DOSSIER_PERCENTILE}% of Indonesian fire cells. The PDF opens as a printable page: use “Print / save as PDF”.
        </>
      }
      tag={<LiveTag>Archive + NRT</LiveTag>}
    >
      {ctx.forensic.status === 'loading' && <p className="text-[12px] text-white/55">Reading the signature…</p>}
      {(ctx.forensic.status === 'none' || ctx.forensic.status === 'error') && (
        <p className="text-[12px] text-white/60">
          {ctx.archive === 'outside' ? 'Dossiers cover Indonesian fire cells only.' : 'Too little fire history here to build a dossier.'}
        </p>
      )}
      {f && (
        <div>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="text-white/60">National rank</span>
            <span className={cn('font-mono font-semibold tabular-nums', unlocked ? 'text-[#fca5a5]' : 'text-white/85')}>
              p{Math.round(f.percentile)} <span className="font-normal text-white/45">/ needs p{DOSSIER_PERCENTILE}</span>
            </span>
          </div>
          <div className="relative mt-2 h-2 rounded-full bg-white/[0.07]" role="img" aria-label={`Rank p${Math.round(f.percentile)}; the dossier unlocks at p${DOSSIER_PERCENTILE}`}>
            <span className={cn('meter-fill absolute inset-y-0 left-0 rounded-full', unlocked ? 'bg-[#fca5a5]' : 'bg-white/40')} style={{ width: `${f.percentile}%` }} />
            <span className="absolute -top-1 bottom-[-4px] w-[2px] rounded bg-accent-300" style={{ left: `${DOSSIER_PERCENTILE}%` }} aria-hidden />
          </div>
          <p className={cn('mt-2 flex items-center gap-1.5 text-[12px]', unlocked ? 'text-[#fca5a5]' : 'text-white/55')}>
            {unlocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {unlocked ? 'Unlocked: this spot is in the top 10%.' : 'Locked. Add field reports in tab 02 instead.'}
          </p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={!unlocked || busy !== null} onClick={makePdf}>
          {unlocked ? <FileText className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {busy === 'pdf' ? 'Building…' : 'Generate evidence dossier (PDF)'}
        </button>
        <button type="button" className={btnGhost} disabled={!unlocked || busy !== null} onClick={makeCsv}>
          <FileDown className="h-3.5 w-3.5" /> {busy === 'csv' ? 'Building…' : 'Detections CSV'}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] text-[#fca5a5]">{error}</p>}
    </Panel>
  );
}

function P2PBoard({ cell }: { cell: string }) {
  const key = `artemis:p2p:${cell}`;
  const seed = () => DEFAULT_NEEDS.map((n, i) => ({ ...n, id: `seed-${i}` }));
  const load = () => normalize(readLocal<Need[] | null>(key, null) ?? seed());
  const [needs, setNeeds] = useState<Need[]>(load);
  const [draft, setDraft] = useState('');
  useEffect(() => setNeeds(load()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const pledged = needs.filter((n) => n.status === 'pledged').length;

  const update = (next: Need[]) => {
    setNeeds(next);
    writeLocal(key, next);
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const label = draft.trim();
    if (!label) return;
    update([...needs, { id: crypto.randomUUID(), label, status: 'needed' }]);
    setDraft('');
  };

  return (
    <Panel
      title="P2P logistics board"
      tag={<SimTag kind="Demo" info="Field teams list what they physically need; nearby universities, student nature clubs (Mapala) and pharmacies pledge and deliver directly. Click a status to switch it. Saved in this browser only." />}
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
          <span className="block h-full rounded-full bg-[#7dd3fc] transition-[width] duration-500 ease-out" style={{ width: `${needs.length ? (pledged / needs.length) * 100 : 0}%` }} />
        </span>
        <span className="font-mono text-[10px] tabular-nums text-white/55">
          {pledged}/{needs.length} pledged
        </span>
      </div>
      <ul className="mt-2 divide-y divide-white/[0.06]">
        {needs.map((n) => {
          const on = n.status === 'pledged';
          return (
          <li key={n.id} className="flex items-center justify-between gap-3 py-2">
            <span className={cn('text-[13px] transition-colors', on ? 'text-white/55' : 'text-white/85')}>{n.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                key={n.status}
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${n.label}: ${on ? 'pledged' : 'needed'}`}
                onClick={() => update(needs.map((x) => (x.id === n.id ? { ...x, status: on ? 'needed' : 'pledged' } : x)))}
                className={cn(
                  'pop-in flex w-[5.5rem] items-center justify-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors',
                  on ? 'border-[#7dd3fc]/45 bg-[#7dd3fc]/10 text-[#7dd3fc] hover:bg-[#7dd3fc]/15' : 'border-[#fdba74]/45 text-[#fdba74] hover:bg-[#fdba74]/10',
                )}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
                {on ? 'Pledged' : 'Needed'}
              </button>
              <button type="button" onClick={() => update(needs.filter((x) => x.id !== n.id))} aria-label={`Remove ${n.label}`} className="rounded-[4px] p-1.5 text-white/55 hover:bg-white/[0.06] hover:text-white">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <label htmlFor="need-input" className="sr-only">New need</label>
        <input
          id="need-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. 4 fire beaters"
          className="min-w-0 flex-1 rounded-[4px] border border-white/[0.14] bg-[#0d0d0d] px-2.5 py-1.5 text-[13px] text-white/85 placeholder:text-white/45"
        />
        <button type="submit" className={btnGhost}>
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </form>
    </Panel>
  );
}

export function WatchdogTab({ ctx, liveHotspots }: { ctx: HubContext; liveHotspots: FireHotspot[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DossierPanel ctx={ctx} liveHotspots={liveHotspots} />
      <P2PBoard cell={ctx.target.cell} />
    </div>
  );
}
