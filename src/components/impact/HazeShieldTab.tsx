import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Copy, Droplets, GraduationCap, Map as MapIcon, Navigation, RotateCw, Send, Stethoscope, Thermometer, Wind, X } from 'lucide-react';

import { addCartoBasemap } from '@/lib/basemap';
import { fetchCurrentWeather, type CurrentWeather } from '@/data/weatherApi';
import { fetchFacilitiesInPolygon, FACILITY_LIMIT, type Facility } from '@/data/facilitiesApi';
import { haversineKm } from '@/lib/aoi';
import { BAND_COLORS, bandFor, bearingBetween, buildHazeCone, CONE_HALF_ANGLE_DEG, destination, type HazeConeGeometry } from '@/lib/hazeCone';
import { cn } from '@/lib/utils';
import type { HubContext } from './hubContext';
import { btnGhost, btnPrimary, Hint, LiveTag, Panel, SimTag, SubHead } from './shared';

export type HazeCone = HazeConeGeometry;

const KIND_COLORS = { school: '#7dd3fc', health: '#c4b5fd' } as const;
/** If OpenStreetMap has not answered by then, show clearly-labelled sample facilities. */
const SLOW_MS = 10_000;
const PILL_LIMIT = 12;
const km = (d: number) => (d < 1 ? '<1 km' : `${Math.round(d)} km`);

interface Located extends Facility {
  distKm: number;
  hours: number;
}

/** Placeholder facilities spread through the cone so the alert flow can be tried while OSM is slow. */
function demoFacilities(cone: HazeConeGeometry): Facility[] {
  const spots: [number, number, Facility['kind']][] = [
    [0.35, -8, 'school'],
    [0.55, 6, 'health'],
    [0.7, -12, 'school'],
    [0.85, 10, 'school'],
    [0.92, -4, 'health'],
  ];
  const reach = cone.bands[cone.bands.length - 1]?.toKm ?? 50;
  return spots.map(([f, off, kind], i) => {
    const [la, ln] = destination(cone.origin, cone.bearingDeg + off, reach * f);
    return { id: `demo-${i}`, name: `Sample ${kind === 'school' ? 'school' : 'clinic'} ${String.fromCharCode(65 + i)}`, kind, type: 'demo', lat: la, lng: ln };
  });
}

function ConeMap({ cone, facilities }: { cone: HazeConeGeometry; facilities: Located[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    addCartoBasemap(map, { labels: true, maxZoom: 16 });
    [...cone.bands].reverse().forEach((b) =>
      L.polygon(b.polygon, { color: BAND_COLORS[b.hours], weight: 1, fillColor: BAND_COLORS[b.hours], fillOpacity: 0.22 })
        .bindTooltip(`${b.hours} h · up to ${Math.round(b.toKm)} km`)
        .addTo(map),
    );
    L.circleMarker(cone.origin, { radius: 6, color: '#fff', weight: 2, fillColor: '#d9831c', fillOpacity: 1 }).bindTooltip('Hotspot').addTo(map);
    facilities.forEach((f) =>
      L.circleMarker([f.lat, f.lng], { radius: 4, color: '#000', weight: 1, fillColor: KIND_COLORS[f.kind], fillOpacity: 0.95 })
        .bindTooltip(`${f.name} · ${Math.round(f.distKm)} km`)
        .addTo(map),
    );
    map.fitBounds(L.latLngBounds(cone.outline), { padding: [16, 16] });
    return () => {
      map.remove();
    };
  }, [cone, facilities]);
  return <div ref={ref} className="h-64 w-full rounded-[6px] border border-white/[0.12] bg-[#0a0a0a]" role="img" aria-label="Map of the downwind smoke cone and facilities inside it" />;
}

function alertMessage(ctx: HubContext, weather: CurrentWeather, targets: Located[]): string {
  const where = ctx.place ? ctx.place.split(',').slice(0, 2).join(',') : ctx.calendarRegion.name;
  const first = targets[0];
  const schools = targets.filter((t) => t.kind === 'school').length;
  const health = targets.length - schools;
  const group = [schools && `${schools} school${schools === 1 ? '' : 's'}`, health && `${health} health facilit${health === 1 ? 'y' : 'ies'}`].filter(Boolean).join(' and ');
  return [
    'PERINGATAN ASAP · HAZE ALERT (ARTEMIS)',
    `Satellite fire activity at ${ctx.target.lat.toFixed(4)}, ${ctx.target.lng.toFixed(4)} (${where}).`,
    `Wind from ${weather.windDirectionLabel} at ${weather.windSpeedMetersPerSecond.toFixed(1)} m/s is carrying smoke toward ${
      targets.length === 1 ? `${first.name} (~${Math.round(first.distKm)} km, within ${first.hours} h)` : `${group} within 24 h`
    }.`,
    'Keep children indoors, close windows and doors, and use N95 masks outdoors. Check with BPBD before any closure.',
    'Source: NASA FIRMS + OpenWeatherMap. Screening estimate, not a forecast.',
  ].join('\n');
}

function Metric({ icon, label, value, children }: { icon: React.ReactNode; label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[4px] bg-white/[0.04] px-2.5 py-2">
      <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/50">
        {icon} {label}
      </p>
      <p className="mt-1 flex items-center gap-1.5 font-sans text-[17px] font-semibold leading-none tabular-nums text-white/95">
        {value}
        {children}
      </p>
    </div>
  );
}

function ConditionsPanel({
  weather,
  loading,
  error,
  onRetry,
  cone,
  onShowCone,
}: {
  weather: CurrentWeather | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  cone: HazeConeGeometry | null;
  onShowCone?: (cone: HazeConeGeometry) => void;
}) {
  // Swing the wind arrow in from north once the reading arrives.
  const [spun, setSpun] = useState(false);
  useEffect(() => {
    if (!weather) return;
    const id = requestAnimationFrame(() => setSpun(true));
    return () => cancelAnimationFrame(id);
  }, [weather]);
  const reach = cone ? cone.bands[cone.bands.length - 1].toKm : 1;

  return (
    <Panel
      title="Current conditions"
      tag={
        <LiveTag
          info={
            cone ? (
              <>
                Smoke heads {Math.round(cone.bearingDeg)}° with the current surface wind, ±{CONE_HALF_ANGLE_DEG}° for uncertainty. It assumes the wind holds; it is a quick screening aid, not a smoke dispersion model.
              </>
            ) : (
              'Current weather from OpenWeatherMap.'
            )
          }
        >
          Live wind
        </LiveTag>
      }
      className="lg:sticky lg:top-0"
      bodyClassName="flex flex-col"
    >
      {loading && !weather && (
        <div className="grid grid-cols-2 gap-1.5" aria-label="Loading weather">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-white/[0.05]" />)}
        </div>
      )}
      {error && !weather && (
        <div className="text-[12px] text-white/65">
          <p className="text-[#fca5a5]">Weather unavailable: {error}</p>
          <button type="button" onClick={onRetry} className={cn(btnGhost, 'mt-2')}>
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}
      {weather && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <Metric icon={<Thermometer className="h-3 w-3" />} label="Temp" value={`${weather.temperatureCelsius.toFixed(1)}°C`} />
            <Metric icon={<Droplets className="h-3 w-3" />} label="Humidity" value={`${Math.round(weather.humidityPercent)}%`} />
            <Metric icon={<Wind className="h-3 w-3" />} label="Wind" value={`${weather.windSpeedMetersPerSecond.toFixed(1)} m/s`} />
            <Metric icon={<Navigation className="h-3 w-3" />} label="From" value={`${weather.windDirectionLabel} ${Math.round(weather.windDirectionDegrees)}°`}>
              <Navigation
                className="h-3.5 w-3.5 text-accent-300 transition-transform duration-1000 ease-out motion-reduce:transition-none"
                style={{ transform: `rotate(${spun ? weather.windDirectionDegrees + 180 - 45 : -45}deg)` }}
                aria-hidden
              />
            </Metric>
          </div>
          {weather.condition && <p className="mt-2 text-[11px] capitalize text-white/50">{weather.condition}</p>}
        </>
      )}

      {cone && (
        <div className="mt-3 border-t border-white/[0.08] pt-3">
          <SubHead>Smoke reach</SubHead>
          <ul className="mt-2 space-y-2">
            {cone.bands.map((b, i) => (
              <li key={b.hours} className="text-[12px] text-white/75">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: BAND_COLORS[b.hours] }} /> within {b.hours} h
                  </span>
                  <span className="font-mono tabular-nums text-white/60">{Math.round(b.toKm)} km</span>
                </div>
                <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                  <span className="meter-fill block h-full rounded-full" style={{ width: `${(b.toKm / reach) * 100}%`, backgroundColor: BAND_COLORS[b.hours], animationDelay: `${i * 120}ms` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cone && onShowCone && (
        <button type="button" onClick={() => onShowCone(cone)} className={cn(btnGhost, 'mt-4 w-full')}>
          <MapIcon className="h-3.5 w-3.5" /> Show on main map
        </button>
      )}
    </Panel>
  );
}

export function HazeShieldTab({ ctx, onShowCone }: { ctx: HubContext; onShowCone?: (cone: HazeConeGeometry) => void }) {
  const { lat, lng } = ctx.target;
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [facilities, setFacilities] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; items: Facility[]; error?: string }>({ status: 'idle', items: [] });
  const [slow, setSlow] = useState(false);
  const [preview, setPreview] = useState<Located[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loadWeather = useCallback(() => {
    let cancelled = false;
    setWeatherLoading(true);
    setWeatherError(null);
    fetchCurrentWeather(lat, lng)
      .then((w) => !cancelled && setWeather(w))
      .catch((e: unknown) => !cancelled && setWeatherError(e instanceof Error ? e.message : 'Weather unavailable.'))
      .finally(() => !cancelled && setWeatherLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);
  useEffect(() => loadWeather(), [loadWeather]);

  const cone = useMemo(() => (weather ? buildHazeCone([lat, lng], weather.windDirectionDegrees, weather.windSpeedMetersPerSecond) : null), [weather, lat, lng]);

  useEffect(() => {
    if (!cone) return;
    let cancelled = false;
    setFacilities({ status: 'loading', items: [] });
    setSlow(false);
    const timer = window.setTimeout(() => !cancelled && setSlow(true), SLOW_MS);
    fetchFacilitiesInPolygon(cone.outline)
      .then((items) => !cancelled && setFacilities({ status: 'ready', items }))
      .catch((e: unknown) => !cancelled && setFacilities({ status: 'error', items: [], error: e instanceof Error ? e.message : 'Facility lookup failed.' }));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cone]);

  // Real OSM results always win; sample points only fill in while OSM is slow or down.
  const demo = !!cone && (facilities.status === 'error' || (facilities.status === 'loading' && slow));
  const items = useMemo(() => (demo && cone ? demoFacilities(cone) : facilities.items), [demo, cone, facilities.items]);

  const located = useMemo<Located[]>(() => {
    if (!cone) return [];
    return items
      .flatMap((f) => {
        const distKm = haversineKm(lat, lng, f.lat, f.lng);
        const band = bandFor(cone, distKm, bearingBetween([lat, lng], [f.lat, f.lng]));
        return band ? [{ ...f, distKm, hours: band.hours }] : [];
      })
      .sort((a, b) => a.distKm - b.distKm);
  }, [items, cone, lat, lng]);

  useEffect(() => setPreview(null), [demo]);

  const counts = useMemo(() => ({ school: located.filter((f) => f.kind === 'school').length, health: located.filter((f) => f.kind === 'health').length }), [located]);
  const shown = showAll ? located : located.slice(0, PILL_LIMIT);
  const message = weather && preview?.length ? alertMessage(ctx, weather, preview) : '';

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <ConditionsPanel weather={weather} loading={weatherLoading} error={weatherError} onRetry={loadWeather} cone={cone} onShowCone={onShowCone} />

      <div className="space-y-4">
        {cone && <ConeMap cone={cone} facilities={located} />}

        <Panel
          title="Facilities in the cone"
          tag={
            demo ? (
              <SimTag
                kind="Demo"
                info={`OpenStreetMap is ${facilities.status === 'error' ? 'not answering' : 'slow to answer'}, so these are made-up sample points placed inside the cone to let you try the alert. They are not real facilities${facilities.status === 'loading' ? ' and will be replaced as soon as OpenStreetMap responds' : ''}.`}
              />
            ) : (
              <LiveTag info={`Schools, clinics and hospitals mapped in OpenStreetMap. Coverage in rural areas is incomplete.${facilities.items.length >= FACILITY_LIMIT ? ` Only the first ${FACILITY_LIMIT} results are used.` : ''}`}>
                OpenStreetMap
              </LiveTag>
            )
          }
        >
          {!cone && <Hint>{weatherError ? 'The smoke cone needs the current wind. Retry the weather on the left.' : 'Waiting for the current wind…'}</Hint>}
          {facilities.status === 'loading' && !demo && (
            <p className="flex items-center gap-2 text-[12px] text-white/55">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-accent-400" /> Looking up schools and clinics in the cone…
            </p>
          )}
          {facilities.status === 'ready' && located.length === 0 && <Hint>No mapped schools or health facilities in the 24-hour cone.</Hint>}
          {located.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12px] text-white/70">
                  <span className="font-semibold text-white">{counts.school}</span> school{counts.school === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold text-white">{counts.health}</span> health · nearest {km(located[0].distKm)}
                </p>
                <button type="button" className={cn(btnPrimary, 'px-3.5 py-2.5')} onClick={() => { setPreview(located); setCopied(false); }}>
                  <Send className="h-3.5 w-3.5" /> Broadcast haze alert (WA/SMS)
                </button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Facilities, nearest first. Select one to alert only that facility.">
                {shown.map((f, i) => (
                  <li key={f.id} className="msg-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                    <button
                      type="button"
                      onClick={() => { setPreview([f]); setCopied(false); }}
                      title={`${f.type} · within ${f.hours} h · alert only this one`}
                      className="flex max-w-[15rem] items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.03] py-1 pl-2 pr-2.5 text-[12px] text-white/80 transition-colors hover:border-white/30 hover:bg-white/[0.07] hover:text-white"
                    >
                      {f.kind === 'school' ? <GraduationCap className="h-3.5 w-3.5 shrink-0" style={{ color: KIND_COLORS.school }} /> : <Stethoscope className="h-3.5 w-3.5 shrink-0" style={{ color: KIND_COLORS.health }} />}
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: BAND_COLORS[f.hours] }}>{km(f.distKm)}</span>
                    </button>
                  </li>
                ))}
                {located.length > PILL_LIMIT && (
                  <li>
                    <button type="button" onClick={() => setShowAll((s) => !s)} className="rounded-full border border-dashed border-white/[0.2] px-2.5 py-1 font-mono text-[11px] text-white/60 hover:border-white/40 hover:text-white">
                      {showAll ? 'Show fewer' : `+${located.length - PILL_LIMIT} more`}
                    </button>
                  </li>
                )}
              </ul>
            </>
          )}
        </Panel>

        {preview && weather && (
          <Panel
            title="Haze alert preview"
            className="msg-in"
            tag={
              <span className="flex items-center gap-1">
                <SimTag info="Nothing is sent: there is no WhatsApp Business or SMS account behind this demo. Copy the text to share it yourself." />
                <button type="button" onClick={() => setPreview(null)} aria-label="Close preview" className="rounded-[4px] p-1 text-white/55 hover:bg-white/[0.06] hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </span>
            }
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/50">
              To: {preview.length === 1 ? preview[0].name : `${preview.length} principals and facility heads`}
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-[6px] border border-[#6ee7b7]/20 bg-[#0c1a14] p-3 font-mono text-[12px] leading-5 text-white/85">{message}</pre>
            <button
              type="button"
              className={cn(btnGhost, 'mt-3')}
              onClick={() => navigator.clipboard?.writeText(message).then(() => setCopied(true)).catch(() => setCopied(false))}
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy text'}
            </button>
          </Panel>
        )}
      </div>
    </div>
  );
}
