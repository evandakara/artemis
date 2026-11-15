import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Camera, ImagePlus, MessageSquareText, Trash2, X } from 'lucide-react';

import { readLocal, writeLocal } from '@/lib/localStore';
import { cn } from '@/lib/utils';
import type { HubContext } from './hubContext';
import { btnGhost, btnPrimary, Panel, SimTag, SubHead } from './shared';

const LABELS_KEY = 'artemis:labels';

const REPLIES = {
  '1': 'Confirmed fire',
  '2': 'Controlled agri burn',
  '3': 'False alarm',
} as const;
type Reply = keyof typeof REPLIES;

const LABEL_TONE: Record<string, string> = {
  'Confirmed fire': 'bg-[#fca5a5]',
  'Open flame': 'bg-[#fca5a5]',
  'Smoke column': 'bg-[#fdba74]',
  'Controlled agri burn': 'bg-[#fdba74]',
  'Fresh burn scar': 'bg-[#fdba74]',
  'False alarm': 'bg-[#6ee7b7]',
  'No fire visible': 'bg-[#6ee7b7]',
};

const PHOTO_KINDS = ['Smoke column', 'Open flame', 'Fresh burn scar', 'No fire visible'] as const;

interface GroundLabel {
  id: string;
  cell: string;
  lat: number;
  lng: number;
  at: string;
  channel: 'sms' | 'photo';
  label: string;
  note?: string;
}

interface ChatLine {
  from: 'bot' | 'patrol';
  text: string;
}

function alertText(ctx: HubContext): string {
  const h = ctx.target.live;
  const when = h ? `${h.date} ${h.acqTime} UTC` : new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return [
    'ARTEMIS HOTSPOT ALERT',
    `${ctx.target.lat.toFixed(4)}, ${ctx.target.lng.toFixed(4)}`,
    ctx.place ? ctx.place.split(',').slice(0, 2).join(',') : ctx.calendarRegion.name,
    `${when}${h ? ` · ${h.satellite ?? h.source} · FRP ${h.frp.toFixed(1)} MW` : ''}`,
    'Reply 1 = Confirmed fire, 2 = Controlled agri burn, 3 = False alarm',
  ].join('\n');
}

export function GroundTruthTab({ ctx }: { ctx: HubContext }) {
  const { cell, lat, lng } = ctx.target;
  const [labels, setLabels] = useState<GroundLabel[]>(() => readLocal<GroundLabel[]>(LABELS_KEY, []));
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [photoKind, setPhotoKind] = useState<string>(PHOTO_KINDS[0]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLOListElement>(null);

  useEffect(() => setChat([{ from: 'bot', text: alertText(ctx) }]), [ctx.place, cell]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat]);

  const mine = useMemo(() => labels.filter((l) => l.cell === cell).slice().reverse(), [labels, cell]);

  const save = (entry: Omit<GroundLabel, 'id' | 'cell' | 'lat' | 'lng' | 'at'>) => {
    const next = [...readLocal<GroundLabel[]>(LABELS_KEY, []), { ...entry, id: crypto.randomUUID(), cell, lat, lng, at: new Date().toISOString() }];
    writeLocal(LABELS_KEY, next);
    setLabels(next);
  };

  const reply = (r: Reply) => {
    setChat((c) => [
      ...c,
      { from: 'patrol', text: r },
      { from: 'bot', text: `Received: ${REPLIES[r]}. Logged for cell ${cell.slice(0, 9)}. Terima kasih.` },
    ]);
    save({ channel: 'sms', label: REPLIES[r] });
  };

  const pick = (file: File | undefined) => {
    if (file && file.type.startsWith('image/')) setPhoto({ url: URL.createObjectURL(file), name: file.name });
  };

  const clearPhoto = () => {
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submitPhoto = () => {
    if (!photo) return;
    save({ channel: 'photo', label: photoKind, note: photo.name });
    clearPhoto();
  };

  const remove = (id: string) => {
    const next = readLocal<GroundLabel[]>(LABELS_KEY, []).filter((l) => l.id !== id);
    writeLocal(LABELS_KEY, next);
    setLabels(next);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Panel
        title="SMS / WhatsApp gateway"
        tag={<SimTag info="How a village fire patrol with no mobile data gets the alert and answers with one digit. No SMS is sent; replies are saved in this browser only." />}
      >
        <div className="rounded-[8px] border border-white/[0.14] bg-[#0c0c0c] p-3">
          <div className="mb-2 flex items-center gap-2 border-b border-white/[0.08] pb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">
            <MessageSquareText className="h-3.5 w-3.5" /> ARTEMIS · +62 SMS gateway
          </div>
          <ol ref={chatRef} className="max-h-64 space-y-2 overflow-y-auto" aria-live="polite">
            {chat.map((m, i) => (
              <li
                key={i}
                className={cn(
                  'w-fit max-w-[90%] whitespace-pre-line rounded-[6px] px-2.5 py-2 font-mono text-[11px] leading-4',
                  m.from === 'bot' ? 'msg-in bg-white/[0.07] text-white/85' : 'msg-in-right ml-auto bg-accent-500/20 text-accent-100',
                )}
                style={{ animationDelay: m.from === 'bot' && i > 0 ? '220ms' : undefined }}
              >
                {m.text}
              </li>
            ))}
          </ol>
          <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Reply as patrol">
            {(Object.keys(REPLIES) as Reply[]).map((r) => (
              <button key={r} type="button" onClick={() => reply(r)} className={cn(btnGhost, 'flex-col gap-0.5 px-1.5 py-1.5')} title={REPLIES[r]}>
                Reply {r}
                <span className="font-sans text-[10px] font-normal normal-case tracking-normal text-white/45">{REPLIES[r].split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel
        title="Field evidence & validation log"
        tag={<SimTag info="Photos stay in this browser: they are previewed, never uploaded, and only the file name and your label are kept. In a real launch these reports would become training labels that check the signature score." />}
      >
        {!photo ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-3 rounded-[6px] border border-dashed px-3 py-2.5 transition-colors',
              dragging ? 'border-accent-400 bg-accent-500/[0.08]' : 'border-white/[0.2] hover:border-white/35 hover:bg-white/[0.02]',
            )}
          >
            <span className="flex items-center gap-2 text-[12px] text-white/65">
              <ImagePlus className={cn('h-4 w-4 transition-transform', dragging ? 'scale-110 text-accent-300' : 'text-white/50')} />
              {dragging ? 'Drop the photo here' : 'Drag a field photo here'}
            </span>
            <span className={cn(btnGhost, 'pointer-events-none py-1.5')}>
              <Camera className="h-3.5 w-3.5" /> Choose photo
            </span>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="msg-in flex gap-3 rounded-[6px] border border-white/[0.14] bg-[#0d0d0d] p-2">
            <img src={photo.url} alt="Selected field photo preview" className="h-20 w-24 shrink-0 rounded-[4px] object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/55" htmlFor="photo-kind">What does it show?</label>
                <button type="button" onClick={clearPhoto} aria-label="Remove photo" className="-mr-1 -mt-1 rounded-[4px] p-1 text-white/50 hover:bg-white/[0.06] hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <select id="photo-kind" value={photoKind} onChange={(e) => setPhotoKind(e.target.value)} className="min-w-0 flex-1 rounded-[4px] border border-white/[0.14] bg-[#111] px-2 py-1.5 text-[13px] text-white/85">
                  {PHOTO_KINDS.map((k) => <option key={k}>{k}</option>)}
                </select>
                <button type="button" onClick={submitPhoto} className={btnPrimary}>Submit</button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-white/[0.08] pt-3">
          <SubHead
            right={<span className="rounded-full bg-white/[0.08] px-2 py-0.5 font-mono text-[10px] tabular-nums text-white/70">{mine.length}</span>}
          >
            Submitted ground-truth labels
          </SubHead>
          {mine.length === 0 ? (
            <p className="mt-3 text-[13px] text-white/55">No field reports yet. Tap Reply 1, 2 or 3 on the SMS simulator, or upload a photo to test.</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/[0.06]">
              {mine.map((l) => (
                <li key={l.id} className="msg-in flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', LABEL_TONE[l.label] ?? 'bg-white/40')} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[13px] text-white/85">{l.label}</p>
                      <p className="truncate font-mono text-[10px] text-white/50">
                        {l.channel === 'sms' ? 'SMS reply' : `Photo · ${l.note}`} · {l.at.slice(0, 16).replace('T', ' ')}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => remove(l.id)} aria-label={`Delete label ${l.label}`} className="rounded-[4px] p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
