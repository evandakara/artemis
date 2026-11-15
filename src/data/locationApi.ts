export interface LocationResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  address?: {
    state?: unknown;
    region?: unknown;
    province?: unknown;
    country?: unknown;
  };
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

function parseLocation(item: NominatimResult): LocationResult | null {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const address = item.address;
  const displayName = [
    address?.state,
    address?.region,
    address?.province,
    address?.country,
  ].find((value) => typeof value === 'string' && value.trim()) ?? item.display_name;

  return {
    displayName: typeof displayName === 'string' ? displayName : 'Selected area',
    latitude,
    longitude,
  };
}

export async function geocodeLocation(
  locationName: string,
  signal?: AbortSignal,
): Promise<LocationResult> {
  if (!locationName.trim()) throw new Error('A location name is required.');
  const params = new URLSearchParams({
    q: locationName,
    format: 'jsonv2',
    limit: '1',
  });
  const response = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Location search failed (${response.status}).`);
  const results = await response.json() as NominatimResult[];
  const location = results.map(parseLocation).find((item): item is LocationResult => item !== null);
  if (!location) throw new Error(`No map location found for "${locationName}".`);
  return location;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<LocationResult> {
  const params = new URLSearchParams({
    lat: latitude.toString(),
    lon: longitude.toString(),
    format: 'jsonv2',
    zoom: '10',
  });
  const response = await fetch(`${NOMINATIM_URL}/reverse?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Location lookup failed (${response.status}).`);
  const result = await response.json() as NominatimResult;
  const location = parseLocation(result);
  if (!location) throw new Error('Unable to identify the selected map area.');
  return location;
}

export interface AdminArea {
  /** English country name, e.g. "Australia". */
  country: string;
  /** ISO 3166-1 alpha-2, lower case, e.g. "au". */
  countryCode: string;
  /** First-level region in English (state / province), when known. */
  state: string | null;
}

// One lookup per point, shared by the Impact Hub header and the donation list
// (Nominatim asks for at most one request per second). Failures are not cached.
const adminCache = new Map<string, Promise<AdminArea>>();

async function lookupAdmin(latitude: number, longitude: number): Promise<AdminArea> {
  const params = new URLSearchParams({
    lat: latitude.toString(),
    lon: longitude.toString(),
    format: 'jsonv2',
    zoom: '5',
    'accept-language': 'en',
  });
  const response = await fetch(`${NOMINATIM_URL}/reverse?${params.toString()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Location lookup failed (${response.status}).`);
  const result = await response.json() as { address?: { country?: unknown; country_code?: unknown; state?: unknown } };
  const a = result.address;
  if (typeof a?.country !== 'string' || typeof a.country_code !== 'string') throw new Error('No country at this point.');
  return { country: a.country, countryCode: a.country_code.toLowerCase(), state: typeof a.state === 'string' ? a.state : null };
}

/** Country and state of a point (English names), for matching local organizations. */
export function reverseGeocodeAdmin(latitude: number, longitude: number, signal?: AbortSignal): Promise<AdminArea> {
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  let hit = adminCache.get(key);
  if (!hit) {
    hit = lookupAdmin(latitude, longitude);
    adminCache.set(key, hit);
    hit.catch(() => adminCache.delete(key));
  }
  const shared = hit;
  if (!signal) return shared;
  // The shared request keeps running; an aborted caller just stops waiting for it.
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    shared.then(resolve, reject);
  });
}
