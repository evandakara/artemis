import L from 'leaflet';

// Dark basemap for every Leaflet map in the app.
//
// CARTO's dark tiles need a key: without one they return only an "API KEY REQUIRED"
// watermark, which made the command center unusable on machines without a .env (a
// fresh clone, a Codespace, a teammate's laptop). With no VITE_CARTO_API_KEY we fall back
// to Esri's keyless World Dark Gray canvas, which looks close and needs no setup.
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY || '';

const CARTO_BASE = `https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png?key=${CARTO_KEY}`;
const CARTO_LABELS = `https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png?key=${CARTO_KEY}`;
const CARTO_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

const ESRI_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
/** Esri's dark canvas has tiles up to zoom 16; Leaflet upscales beyond that. */
const ESRI_MAX_NATIVE_ZOOM = 16;

export const HAS_CARTO_KEY = CARTO_KEY.length > 0;

interface BasemapOptions {
  labels?: boolean;
  maxZoom?: number;
  minZoom?: number;
  noWrap?: boolean;
}

/** Adds the dark basemap (and optionally its label layer, above the data) to a Leaflet map. */
export function addCartoBasemap(map: L.Map, { labels = false, maxZoom = 17, minZoom, noWrap }: BasemapOptions = {}): void {
  const common = { maxZoom, ...(minZoom !== undefined && { minZoom }), ...(noWrap !== undefined && { noWrap }) };
  if (HAS_CARTO_KEY) {
    L.tileLayer(CARTO_BASE, { ...common, attribution: CARTO_ATTRIBUTION }).addTo(map);
    if (labels) L.tileLayer(CARTO_LABELS, { ...common, pane: 'shadowPane' }).addTo(map);
    return;
  }
  L.tileLayer(ESRI_BASE, { ...common, maxNativeZoom: ESRI_MAX_NATIVE_ZOOM, attribution: ESRI_ATTRIBUTION }).addTo(map);
  if (labels) L.tileLayer(ESRI_LABELS, { ...common, maxNativeZoom: ESRI_MAX_NATIVE_ZOOM, pane: 'shadowPane' }).addTo(map);
}
