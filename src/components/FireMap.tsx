import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { addCartoBasemap } from '@/lib/basemap';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import type { FireHotspot, Region } from '@/types';
import { REGIONS } from '@/data/regions';
import { fetchCurrentWeather, type CurrentWeather } from '@/data/weatherApi';
import { WeatherInfoCard } from '@/components/WeatherInfoCard';
import { reverseGeocode } from '@/data/locationApi';
import { aoiContains, type Aoi, type LatLng } from '@/lib/aoi';
import { useFilters, type DrawMode } from '@/state/filters';
import { FRP_TICKS, frpColor, frpGradient, frpT } from '@/lib/frpStyle';

interface FireMapProps {
  region: Region;
  aoi: Aoi;
  drawMode: DrawMode;
  onAoiDrawn: (aoi: Aoi) => void;
  onDrawModeChange: (mode: DrawMode) => void;
  /** Overrides the status line under the map title (e.g. archive month). */
  statusLabel?: string;
  /** Opens the hotspot inspector for a clicked live detection. */
  onInspect?: (hotspot: FireHotspot) => void;
  children?: ReactNode;
  selectedDate: string | null;
  liveModisHotspots: FireHotspot[];
  liveViirsHotspots: FireHotspot[];
  liveHarmonizedHotspots: FireHotspot[];
  liveDate: string | null;
  showAllRegions: boolean;
  onToggleAllRegions: () => void;
  onLocationChange: (location: string) => void;
  onMapReady: (map: L.Map) => void;
}


const MAX_LIVE_MAP_POINTS = 1000;


export function FireMap({
  region,
  aoi,
  drawMode,
  onAoiDrawn,
  onDrawModeChange,
  statusLabel,
  onInspect,
  children,
  selectedDate,
  liveModisHotspots,
  liveViirsHotspots,
  liveHarmonizedHotspots,
  liveDate,
  showAllRegions,
  onToggleAllRegions,
  onLocationChange,
  onMapReady,
}: FireMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    modis: L.FeatureGroup;
    viirs: L.FeatureGroup;
    harmonized: L.FeatureGroup;
    regions: L.FeatureGroup;
    aoi: L.FeatureGroup;
    draft: L.FeatureGroup;
  }>({
    modis: new L.FeatureGroup(),
    viirs: new L.FeatureGroup(),
    harmonized: new L.FeatureGroup(),
    regions: new L.FeatureGroup(),
    aoi: new L.FeatureGroup(),
    draft: new L.FeatureGroup(),
  });
  const initialView = useRef({ center: region.center, zoom: region.zoom });

  const [showModis, setShowModis] = useState(false);
  const [showViirs, setShowViirs] = useState(false);
  const [showHarmonized, setShowHarmonized] = useState(true);
  const [showLayerInfo, setShowLayerInfo] = useState(false);
  const { ramp } = useFilters();
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      minZoom: 2,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    }).setView(initialView.current.center, initialView.current.zoom);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.createPane('modisPane').style.zIndex = '420';
    map.createPane('viirsPane').style.zIndex = '430';
    map.createPane('harmonizedPane').style.zIndex = '440';

    // CARTO dark tiles with a key, Esri's keyless dark canvas without one (src/lib/basemap.ts).
    addCartoBasemap(map, { labels: true, maxZoom: 19, minZoom: 2, noWrap: true });

    // Add layer groups to map
    layersRef.current.modis.addTo(map);
    layersRef.current.viirs.addTo(map);
    layersRef.current.harmonized.addTo(map);
    layersRef.current.regions.addTo(map);
    layersRef.current.aoi.addTo(map);
    layersRef.current.draft.addTo(map);

    mapInstance.current = map;
    onMapReady(map);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [onMapReady]);

  // Update map view when region changes
  useEffect(() => {
    if (mapInstance.current) {
      mapInstance.current.flyTo([region.center[0], region.center[1]], region.zoom, {
        duration: 1.5
      });
    }
  }, [region]);

  // Update markers
  useEffect(() => {
    if (!mapInstance.current) return;

    const { modis, viirs, harmonized } = layersRef.current;
    modis.clearLayers();
    viirs.clearLayers();
    harmonized.clearLayers();

    if (!selectedDate) return;

    const isLiveDate = liveDate === selectedDate;
    const filterLive = (points: FireHotspot[]) => isLiveDate
      ? points.filter((point) => aoiContains(aoi, point.lat, point.lng))
        .sort((a, b) => b.frp - a.frp).slice(0, MAX_LIVE_MAP_POINTS)
        .reverse() // draw the hottest last, on top
      : [];
    // Only real FIRMS observations are drawn. Historical dates render nothing
    // until the processed archive layer (Sprint 2) is available.
    const hotspots = {
      modis: filterLive(liveModisHotspots),
      viirs: filterLive(liveViirsHotspots),
      harmonized: filterLive(liveHarmonizedHotspots),
    };

    const createPopup = (point: FireHotspot, color: string) => `
      <div style="background-color: #0f0f0f; border: 1px solid rgba(255,255,255,0.04); padding: 12px; border-radius: 8px; color: #fff; font-family: Inter, sans-serif; min-width: 200px;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 600; margin-bottom: 8px; color: #e5e5e5; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;"><span style="width: 8px; height: 8px; border-radius: 9999px; background: ${color}; flex-shrink: 0;"></span>${point.source}${point.satellite ? ` · ${point.satellite}` : ''} Detection</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
          <span style="color: #888;">FRP</span>
          <span style="font-family: 'JetBrains Mono', monospace;">${point.frp.toFixed(1)} MW</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
          <span style="color: #888;">Confidence</span>
          <span style="font-family: 'JetBrains Mono', monospace;">${point.confidence}%</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span style="color: #888;">Brightness</span>
          <span style="font-family: 'JetBrains Mono', monospace;">${point.brightness.toFixed(1)} K</span>
        </div>
      </div>
    `;

    const addMarkers = (
      data: FireHotspot[],
      group: L.FeatureGroup,
      pane: string,
      scaleBump: number,
    ) => {
      data.forEach(point => {
        // Colour = FRP on the selected ramp; shape = sensor (VIIRS filled, MODIS ring).
        // Small dots (2.5–4.5 px, + scale bump per layer) keep the archive hexes visible.
        const color = frpColor(ramp, point.frp);
        const r = 2.5 + 2 * frpT(point.frp) + scaleBump;
        const marker = L.circleMarker([point.lat, point.lng], point.source === 'MODIS'
          ? { radius: r + 0.5, fillColor: '#050505', fillOpacity: 0.55, color, weight: 1.75, opacity: 1, pane }
          : { radius: r, fillColor: color, fillOpacity: 0.95, color: '#050505', weight: 1, opacity: 0.9, pane });

        marker.bindPopup(createPopup(point, color), {
          className: 'custom-popup',
          closeButton: false,
        });
        marker.on('click', () => {
          onInspect?.(point);
          setSelectedCoordinates({ lat: point.lat, lng: point.lng });
          reverseGeocode(point.lat, point.lng)
            .then((location) => onLocationChange(location.displayName))
            .catch(() => onLocationChange('Selected disaster area'));
        });
        
        group.addLayer(marker);
      });
    };

    addMarkers(hotspots.modis, modis, 'modisPane', 0);
    addMarkers(hotspots.viirs, viirs, 'viirsPane', 0);
    addMarkers(hotspots.harmonized, harmonized, 'harmonizedPane', 0.5);

  }, [aoi, selectedDate, liveDate, liveModisHotspots, liveViirsHotspots, liveHarmonizedHotspots, onLocationChange, onInspect, ramp]);

  // Outline the active area of interest (neutral stroke; orange is reserved for signal).
  useEffect(() => {
    const group = layersRef.current.aoi;
    group.clearLayers();
    const style: L.PathOptions = { color: '#e4e7ec', weight: 1.5, opacity: 0.7, dashArray: '6 5', fillColor: '#e4e7ec', fillOpacity: 0.03, interactive: false };
    if (aoi.kind === 'point') {
      L.circle([aoi.lat, aoi.lng], { ...style, radius: aoi.radiusKm * 1000 }).addTo(group);
      L.circleMarker([aoi.lat, aoi.lng], { radius: 3, color: '#e4e7ec', weight: 1.5, fillOpacity: 1, interactive: false }).addTo(group);
    } else if (aoi.kind === 'polygon') {
      L.polygon(aoi.points, style).addTo(group);
    } else if (aoi.regionId !== 'global') {
      L.rectangle(region.bounds, { ...style, fillOpacity: 0 }).addTo(group);
    }
  }, [aoi, region.bounds]);

  // Interactive drawing: polygon vertices or a point centre.
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || drawMode === 'none') return;
    const container = map.getContainer();
    const draft = layersRef.current.draft;
    const vertices: LatLng[] = [];
    container.style.cursor = 'crosshair';
    map.doubleClickZoom.disable();

    const redraw = () => {
      draft.clearLayers();
      if (vertices.length > 1) {
        L.polyline(vertices, { color: '#ecb067', weight: 1.5, dashArray: '4 4', interactive: false }).addTo(draft);
      }
      vertices.forEach((v, i) => {
        L.circleMarker(v, {
          radius: i === 0 ? 5 : 3.5, color: '#ecb067', weight: 1.5, fillColor: '#0b0b0b', fillOpacity: 1, interactive: false,
        }).addTo(draft);
      });
    };
    const finish = () => {
      if (vertices.length >= 3) onAoiDrawn({ kind: 'polygon', points: [...vertices] });
      onDrawModeChange('none');
    };
    const onClick = (e: L.LeafletMouseEvent) => {
      const point: LatLng = [Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4))];
      if (drawMode === 'point') {
        onAoiDrawn({ kind: 'point', lat: point[0], lng: point[1], radiusKm: aoi.kind === 'point' ? aoi.radiusKm : 25 });
        onDrawModeChange('none');
        return;
      }
      if (vertices.length >= 3) {
        const first = map.latLngToContainerPoint(vertices[0]);
        if (first.distanceTo(e.containerPoint) < 12) {
          finish();
          return;
        }
      }
      // A double-click fires two clicks first; ignore the repeat at the same spot.
      const last = vertices[vertices.length - 1];
      if (last && map.latLngToContainerPoint(last).distanceTo(e.containerPoint) < 6) return;
      vertices.push(point);
      redraw();
    };
    const onDblClick = () => finish();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDrawModeChange('none');
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);
    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKey);
      draft.clearLayers();
      container.style.cursor = '';
      map.doubleClickZoom.enable();
    };
  }, [drawMode, aoi, onAoiDrawn, onDrawModeChange]);

  const loadWeather = React.useCallback(() => {
    if (!selectedCoordinates) return;

    const controller = new AbortController();
    setIsWeatherLoading(true);
    setWeatherError(null);
    setWeather(null);

    fetchCurrentWeather(selectedCoordinates.lat, selectedCoordinates.lng, controller.signal)
      .then(setWeather)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setWeatherError(error instanceof Error ? error.message : 'Unable to load weather data.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsWeatherLoading(false);
      });

    return () => controller.abort();
  }, [selectedCoordinates]);

  useEffect(() => loadWeather(), [loadWeather]);

  // Update regions overlay
  useEffect(() => {
    if (!mapInstance.current) return;
    
    const { regions } = layersRef.current;
    regions.clearLayers();

    if (showAllRegions) {
      REGIONS.forEach(r => {
        const bounds = L.latLngBounds(
          [r.bounds[0][0], r.bounds[0][1]],
          [r.bounds[1][0], r.bounds[1][1]]
        );
        
        const rect = L.rectangle(bounds, {
          color: '#ffffff',
          weight: 1,
          dashArray: '4, 4',
          fillOpacity: 0.05,
          opacity: 0.3
        });
        
        rect.bindTooltip(r.name, {
          permanent: false,
          direction: 'center',
          className: 'bg-[#0f0f0f] border border-white/5 text-white px-2 py-1 rounded text-xs'
        });

        regions.addLayer(rect);
      });
    }
  }, [showAllRegions]);

  // Handle layer visibility
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const { modis, viirs, harmonized } = layersRef.current;

    if (showModis) map.addLayer(modis);
    else map.removeLayer(modis);

    if (showViirs) map.addLayer(viirs);
    else map.removeLayer(viirs);

    if (showHarmonized) map.addLayer(harmonized);
    else map.removeLayer(harmonized);

  }, [showModis, showViirs, showHarmonized]);

  return (
    <div className="relative isolate h-[430px] w-full overflow-hidden rounded-[4px] border border-white/[0.08] bg-[#111111] shadow-[0_14px_45px_rgba(0,0,0,0.2)] sm:h-[540px]">
      <div ref={mapRef} className="absolute inset-0 z-0" />
      {children}

      {selectedCoordinates && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] sm:bottom-4 sm:left-4">
          <WeatherInfoCard
            coordinates={selectedCoordinates}
            weather={weather}
            isLoading={isWeatherLoading}
            error={weatherError}
            onRetry={loadWeather}
            onClose={() => {
              setSelectedCoordinates(null);
              setWeather(null);
              setWeatherError(null);
            }}
          />
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 z-[1000] sm:left-5 sm:top-5">
        <div className="max-w-[calc(100vw-10rem)] rounded-[6px] border border-white/[0.1] bg-[#0e0e0e]/85 px-3 py-2.5 backdrop-blur-md sm:max-w-none sm:px-4 sm:py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e7a356]">
            {statusLabel ? 'Archive activity map' : 'Live activity map'}
          </div>
          <div className="mt-1 text-xs text-white/55">
            {drawMode === 'polygon'
              ? 'Click to add vertices · double-click to finish · Esc cancels'
              : drawMode === 'point'
                ? 'Click the map to set the centre point'
                : statusLabel
                  ?? (selectedDate
                    ? (liveDate === selectedDate ? 'NASA FIRMS live · last 24 h' : `No live layer · ${selectedDate}`)
                    : 'Waiting for NASA FIRMS live data')}
          </div>
        </div>
      </div>
      
      {/* Controls Overlay */}
      <div className="pointer-events-none absolute bottom-3 right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-col gap-2 sm:bottom-4 sm:right-4 sm:top-4">
        <div className="pointer-events-auto flex max-h-full flex-col gap-3 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0e0e0e]/90 p-3 backdrop-blur-md sm:p-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Layers</h3>
            <button
              type="button"
              onClick={() => setShowLayerInfo((current) => !current)}
              aria-expanded={showLayerInfo}
              aria-label="Explain fire map layers"
              className={cn(
                'rounded-md p-1 text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white/75',
                showLayerInfo && 'bg-white/[0.07] text-[#f0a04a]',
              )}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>

          {showLayerInfo && (
            <div className="border-b border-white/[0.08] pb-3 text-[11px] leading-5 text-white/50">
              <p>
                Compare the two satellite sensors with the harmonized record used for analysis.
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-white/80 bg-black/60" />
                  <p><strong className="font-medium text-white/85">MODIS Raw</strong> · rings · longer historical record, 1 km resolution.</p>
                </div>
                <div className="flex gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full border border-black bg-white/80" />
                  <p><strong className="font-medium text-white/85">VIIRS Raw</strong> · filled dots · finer detail, 375 m resolution, detects smaller fires.</p>
                </div>
                <div className="flex gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: frpGradient(ramp) }} />
                  <p><strong className="font-medium text-white/85">Harmonized</strong> · MODIS + VIIRS combined with overlapping detections reduced.</p>
                </div>
              </div>
              <p className="mt-3 text-white/55">
                Use Harmonized for calendars, trends, anomalies, and early warnings.
              </p>
            </div>
          )}
          
            <div className="border-b border-white/[0.08] pb-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/55">Fire intensity · FRP</div>
              <div className="mt-1.5 h-2 w-40 rounded-[2px]" style={{ background: frpGradient(ramp) }} />
              <div className="relative mt-1 h-3 w-40 font-mono text-[9px] tabular-nums text-white/55">
                {FRP_TICKS.map((v) => (
                  <span key={v} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${frpT(v) * 100}%` }}>{v}</span>
                ))}
              </div>
              <div className="mt-1 font-mono text-[9px] text-white/55">MW · log scale</div>
              <div className="mt-2 flex gap-3 text-[11px] text-white/65">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-black bg-white/85" /> VIIRS</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-white/85 bg-black/60" /> MODIS</span>
              </div>
            </div>

          <label className="group flex cursor-pointer items-center gap-3 rounded-[4px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#d9831c]">
            <div
              className={cn("w-3 h-3 rounded-full border", !showHarmonized && "border-white/20")}
              style={showHarmonized ? { background: frpGradient(ramp), borderColor: 'rgba(255,255,255,0.5)' } : undefined}
            />
            <span className={cn("text-sm", showHarmonized ? "text-white" : "text-white/50 group-hover:text-white/70")}>Harmonized</span>
            <input type="checkbox" className="sr-only" checked={showHarmonized} onChange={(e) => setShowHarmonized(e.target.checked)} />
          </label>

          <label className="group flex cursor-pointer items-center gap-3 rounded-[4px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#d9831c]">
            <div
              className={cn("w-3 h-3 rounded-full border", !showModis && "border-white/20")}
              style={showModis ? { background: frpGradient(ramp), borderColor: 'rgba(255,255,255,0.5)' } : undefined}
            />
            <span className={cn("text-sm", showModis ? "text-white" : "text-white/50 group-hover:text-white/70")}>MODIS Raw</span>
            <input type="checkbox" className="sr-only" checked={showModis} onChange={(e) => setShowModis(e.target.checked)} />
          </label>

          <label className="group flex cursor-pointer items-center gap-3 rounded-[4px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#d9831c]">
            <div
              className={cn("w-3 h-3 rounded-full border", !showViirs && "border-white/20")}
              style={showViirs ? { background: frpGradient(ramp), borderColor: 'rgba(255,255,255,0.5)' } : undefined}
            />
            <span className={cn("text-sm", showViirs ? "text-white" : "text-white/50 group-hover:text-white/70")}>VIIRS Raw</span>
            <input type="checkbox" className="sr-only" checked={showViirs} onChange={(e) => setShowViirs(e.target.checked)} />
          </label>
        </div>

        <button
          onClick={onToggleAllRegions}
          className="pointer-events-auto rounded-xl border border-white/[0.1] bg-[#0e0e0e]/90 px-4 py-2.5 text-xs font-medium text-white/65 backdrop-blur-md transition-colors hover:text-white"
        >
          {showAllRegions ? 'Hide Regions' : 'Show Regions'}
        </button>
      </div>

      <style>{`
        .leaflet-popup-content-wrapper {
          background: transparent;
          box-shadow: none;
          padding: 0;
        }
        .leaflet-popup-tip {
          background: #0f0f0f;
          border-top: 1px solid rgba(255,255,255,0.04);
          border-left: 1px solid rgba(255,255,255,0.04);
        }
        .leaflet-container {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
