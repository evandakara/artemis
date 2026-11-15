// Server-side handlers shared by the Vercel functions in /api and the Vite dev
// middleware in vite.config.ts. API keys are read here and never reach the browser.

export interface ProxyResult {
  status: number;
  body: string;
  contentType: string;
  cacheSeconds?: number;
}

type Env = Record<string, string | undefined>;

const FIRMS_PRODUCTS = new Set([
  'MODIS_NRT',
  'MODIS_SP',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT',
  'VIIRS_NOAA21_SP',
  'VIIRS_SNPP_SP',
]);

const text = (status: number, body: string): ProxyResult => ({
  status,
  body,
  contentType: 'text/plain; charset=utf-8',
});

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isArea = (value: string) =>
  value === 'world' || /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(value);

/**
 * GET /api/firms?product=VIIRS_NOAA21_NRT&area=world&days=5&date=2026-11-14
 * Proxies the NASA FIRMS Area API (CSV) with the server-held MAP_KEY.
 */
export async function handleFirms(params: URLSearchParams, env: Env): Promise<ProxyResult> {
  const key = env.FIRMS_API_KEY;
  if (!key) return text(500, 'FIRMS_API_KEY is not configured on the server. Add it to .env (local), Codespaces secrets, or the Vercel environment variables.');

  const product = params.get('product') ?? '';
  const area = params.get('area') ?? 'world';
  const days = Number(params.get('days') ?? '1');
  const date = params.get('date') ?? '';

  if (!FIRMS_PRODUCTS.has(product)) return text(400, `Unsupported FIRMS product: ${product}`);
  if (!isArea(area)) return text(400, 'area must be "world" or "west,south,east,north".');
  if (!Number.isInteger(days) || days < 1 || days > 5) return text(400, 'days must be 1–5.');
  if (date && !isDate(date)) return text(400, 'date must be YYYY-MM-DD.');

  // FIRMS limits transactions per MAP_KEY. Identical requests within 15 min share
  // one upstream call (the landing telemetry and the dashboard ask for the same data).
  const cacheKey = `${product}|${area}|${days}|${date}`;
  const hit = firmsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < FIRMS_TTL_MS) {
    return { status: 200, body: hit.body, contentType: 'text/csv; charset=utf-8', cacheSeconds: 900 };
  }
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${product}/${area}/${days}${date ? `/${date}` : ''}`;
  const response = await fetch(url);
  const body = await response.text();
  if (response.ok) {
    if (firmsCache.size > 20) firmsCache.clear();
    firmsCache.set(cacheKey, { at: Date.now(), body });
  }
  return {
    status: response.status,
    body,
    contentType: 'text/csv; charset=utf-8',
    cacheSeconds: response.ok ? 900 : undefined,
  };
}

const FIRMS_TTL_MS = 15 * 60 * 1000;
const firmsCache = new Map<string, { at: number; body: string }>();

/**
 * GET /api/weather?lat=-0.5&lon=101.4
 * Proxies OpenWeatherMap current weather (metric) with the server-held key.
 */
export async function handleWeather(params: URLSearchParams, env: Env): Promise<ProxyResult> {
  const key = env.OPENWEATHER_API_KEY;
  if (!key) return text(500, 'OPENWEATHER_API_KEY is not configured on the server. Add it to .env (local), Codespaces secrets, or the Vercel environment variables.');

  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return text(400, 'lat and lon must be valid coordinates.');
  }

  const query = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    appid: key,
    units: 'metric',
  });
  const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?${query.toString()}`);
  const body = await response.text();
  return {
    status: response.status,
    body,
    contentType: 'application/json; charset=utf-8',
    cacheSeconds: response.ok ? 600 : undefined,
  };
}

/**
 * GET /api/news
 * Wildfire news from NewsData.io with the server-held key. Fixed query, so the
 * endpoint cannot be used as an open NewsData proxy. NEWSDATA_API_KEY is preferred;
 * the legacy VITE_NEWSDATA_API_KEY name is accepted server-side only.
 */
export async function handleNews(_params: URLSearchParams, env: Env): Promise<ProxyResult> {
  const key = env.NEWSDATA_API_KEY || env.VITE_NEWSDATA_API_KEY;
  if (!key) return text(500, 'NEWSDATA_API_KEY is not configured on the server. Add it to .env (local), Codespaces secrets, or the Vercel environment variables.');
  // English only, newest first, from NewsData's top-priority domains (its curated tier of
  // established outlets), with syndicated duplicates removed.
  const query = new URLSearchParams({
    apikey: key,
    qInTitle: 'wildfire OR "forest fire" OR bushfire OR "peat fire" OR "brush fire"',
    language: 'en',
    prioritydomain: 'top',
    removeduplicate: '1',
    size: '10',
  });
  const response = await fetch(`https://newsdata.io/api/1/latest?${query.toString()}`);
  const body = await response.text();
  return {
    status: response.status,
    body,
    contentType: 'application/json; charset=utf-8',
    cacheSeconds: response.ok ? 1800 : undefined,
  };
}

// NORAD catalog numbers of the live VIIRS platforms.
const TLE_SATELLITES: Record<string, string> = { '43013': 'NOAA-20', '54234': 'NOAA-21' };
const TLE_TTL_MS = 6 * 60 * 60 * 1000;
const tleCache = new Map<string, { at: number; body: string }>();

/**
 * GET /api/tle?catnr=43013
 * Two-line orbital elements from CelesTrak. CelesTrak asks clients not to refetch
 * the same element set more than every two hours, so responses are cached for 6 h.
 */
export async function handleTle(params: URLSearchParams): Promise<ProxyResult> {
  const catnr = params.get('catnr') ?? '';
  if (!TLE_SATELLITES[catnr]) return text(400, 'catnr must be 43013 (NOAA-20) or 54234 (NOAA-21).');

  const hit = tleCache.get(catnr);
  if (hit && Date.now() - hit.at < TLE_TTL_MS) {
    return { status: 200, body: hit.body, contentType: 'text/plain; charset=utf-8', cacheSeconds: 21600 };
  }
  const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=TLE`);
  const body = await response.text();
  const valid = response.ok && /^1 /m.test(body) && /^2 /m.test(body);
  if (!valid) {
    if (hit) return { status: 200, body: hit.body, contentType: 'text/plain; charset=utf-8' };
    return text(502, `CelesTrak returned no element set (${response.status}).`);
  }
  tleCache.set(catnr, { at: Date.now(), body });
  return { status: 200, body, contentType: 'text/plain; charset=utf-8', cacheSeconds: 21600 };
}

export function toResponse(result: ProxyResult): Response {
  const headers: Record<string, string> = { 'Content-Type': result.contentType };
  if (result.cacheSeconds) {
    headers['Cache-Control'] = `public, s-maxage=${result.cacheSeconds}, stale-while-revalidate=${result.cacheSeconds}`;
  }
  return new Response(result.body, { status: result.status, headers });
}
