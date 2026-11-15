// Everything the Impact Hub tabs share about the selected location, loaded once.
import { useEffect, useState } from 'react';

import { fetchForensicCell, fetchRegionCalendar, type ForensicCell, type MonthRecord, type MonthBaseline } from '@/data/historyApi';
import { reverseGeocode, reverseGeocodeAdmin } from '@/data/locationApi';
import { INDONESIA_PROVINCES } from '@/data/regions';
import { currentYearMonth, type YearMonth } from '@/state/yearMonth';
import type { InspectTarget } from '@/components/HotspotInspector';

/** Dossier unlocks for the top 10% of Indonesian fire cells by signature score. */
export const DOSSIER_PERCENTILE = 90;

/** Rough box around Indonesia, used only when the country lookup fails. */
const INDONESIA_BBOX = { minLat: -11.5, maxLat: 6.5, minLng: 94.5, maxLng: 141.5 };

export interface HubContext {
  target: InspectTarget;
  place: string | null;
  /** Country of the point (English), null until the lookup answers or if it fails. */
  country: string | null;
  /**
   * Whether the 2001–2025 harmonized archive covers this point. It covers Indonesia only,
   * so anomaly, seasonality and the signature score are unavailable elsewhere.
   */
  archive: 'loading' | 'covered' | 'outside';
  forensic: { status: 'loading' | 'ready' | 'none' | 'error'; data?: ForensicCell };
  /** Calendar region used for anomaly and seasonality (one of the five provinces, else Indonesia); the country name outside the archive. */
  calendarRegion: { id: string; name: string };
  /** Month the anomaly refers to: the archive month opened, else the current month. */
  month: YearMonth;
  monthRecord: MonthRecord | null;
  months: MonthRecord[];
  baseline: Record<string, MonthBaseline> | null;
}

function regionFor(lat: number, lng: number, provinceName?: string): { id: string; name: string } {
  const byName = provinceName && INDONESIA_PROVINCES.find((p) => p.name.toLowerCase() === provinceName.toLowerCase());
  if (byName) return { id: byName.id, name: byName.name };
  if (!provinceName) {
    const byBox = INDONESIA_PROVINCES.find(
      (p) => lat >= p.bbox.minLat && lat <= p.bbox.maxLat && lng >= p.bbox.minLng && lng <= p.bbox.maxLng,
    );
    if (byBox) return { id: byBox.id, name: byBox.name };
  }
  return { id: 'indonesia', name: 'Indonesia' };
}

const inIndonesiaBox = (lat: number, lng: number) =>
  lat >= INDONESIA_BBOX.minLat && lat <= INDONESIA_BBOX.maxLat && lng >= INDONESIA_BBOX.minLng && lng <= INDONESIA_BBOX.maxLng;

export function useHubContext(target: InspectTarget): HubContext {
  const [place, setPlace] = useState<string | null>(null);
  const [admin, setAdmin] = useState<{ status: 'loading' | 'ready' | 'failed'; country?: string; code?: string }>({ status: 'loading' });
  const [forensic, setForensic] = useState<HubContext['forensic']>({ status: 'loading' });
  const [calendar, setCalendar] = useState<{ months: MonthRecord[]; baseline: Record<string, MonthBaseline> } | null>(null);

  const month: YearMonth = target.archive ? { year: target.archive.year, month: target.archive.month } : currentYearMonth();

  // A scored archive cell is Indonesian by construction; otherwise trust the country lookup,
  // and fall back to a bounding box only if the lookup fails.
  const archive: HubContext['archive'] = forensic.data
    ? 'covered'
    : admin.status === 'ready'
      ? admin.code === 'id' ? 'covered' : 'outside'
      : admin.status === 'failed'
        ? inIndonesiaBox(target.lat, target.lng) ? 'covered' : 'outside'
        : 'loading';
  const country = admin.country ?? (archive === 'covered' ? 'Indonesia' : null);
  const calendarRegion =
    archive === 'outside'
      ? { id: `country-${admin.code ?? 'unknown'}`, name: country ?? 'this area' }
      : regionFor(target.lat, target.lng, forensic.data?.province);

  useEffect(() => {
    let cancelled = false;
    setPlace(null);
    setAdmin({ status: 'loading' });
    setForensic({ status: 'loading' });
    reverseGeocode(target.lat, target.lng)
      .then((r) => !cancelled && setPlace(r.displayName))
      .catch(() => !cancelled && setPlace(null));
    reverseGeocodeAdmin(target.lat, target.lng)
      .then((a) => !cancelled && setAdmin({ status: 'ready', country: a.country, code: a.countryCode }))
      .catch(() => !cancelled && setAdmin({ status: 'failed' }));
    fetchForensicCell(target.cell)
      .then((data) => !cancelled && setForensic(data ? { status: 'ready', data } : { status: 'none' }))
      .catch(() => !cancelled && setForensic({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [target.lat, target.lng, target.cell]);

  useEffect(() => {
    setCalendar(null);
    if (forensic.status === 'loading' || archive !== 'covered') return;
    let cancelled = false;
    fetchRegionCalendar(calendarRegion.id)
      .then((c) => !cancelled && setCalendar({ months: c.variants.masked.months, baseline: c.variants.masked.baseline }))
      .catch(() => !cancelled && setCalendar(null));
    return () => {
      cancelled = true;
    };
  }, [calendarRegion.id, forensic.status, archive]);

  const months = calendar?.months ?? [];
  const monthRecord = months.find((m) => m.year === month.year && m.month === month.month) ?? null;
  return { target, place, country, archive, forensic, calendarRegion, month, monthRecord, months, baseline: calendar?.baseline ?? null };
}
