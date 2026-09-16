import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@/theme/useTheme';

export type Point = { lat: number; lng: number; label?: string };
export type ResultPin = { id: string; lat: number; lng: number; label?: string; sublabel?: string };

type Props = {
  origin: Point | null;
  destination: Point | null;
  /** Optional per-result pins (small dots) plotted along or near the route. */
  resultPins?: ResultPin[];
  /** Fired when a result pin is clicked. */
  onPinClick?: (id: string) => void;
  /** Extra Tailwind classes for the outer container. Height is set by the parent. */
  className?: string;
  /** ARIA label read by screen readers describing the map. */
  ariaLabel?: string;
};

/* Plain OpenStreetMap tiles — always free, no API key. CARTO's rasters now
 * watermark "API KEY REQUIRED" even on the legacy light_all/dark_all endpoints,
 * so we use OSM directly and apply a CSS filter for the dark theme instead. */
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Themed Leaflet map: origin → destination with brand-coloured markers, a
 * dashed polyline, popups, and optional per-result pins. Tile theme swaps
 * with the app theme. Full teardown/rebuild on every render — cheap for a
 * single map and eliminates state-sync bugs.
 */
export default function RouteMap({
  origin, destination, resultPins = [], onPinClick,
  className = '', ariaLabel = 'Route map',
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!boxRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const el = boxRef.current;
    const map = L.map(el, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    mapRef.current = map;

    const isDark = theme === 'dark';
    // Scoped CSS filter class — inverts + hue-rotates the tile pane only.
    // Markers and polyline live in separate panes and keep their real colour.
    el.classList.toggle('tj-map-dark', isDark);
    L.tileLayer(OSM_TILES, {
      maxZoom: 19,
      attribution: OSM_ATTRIB,
    }).addTo(map);

    const bounds: L.LatLngExpression[] = [];

    if (origin) {
      const m = L.marker([origin.lat, origin.lng], { icon: originPin() }).addTo(map);
      m.bindPopup(popupHtml(origin.label ?? 'Origin', 'Origin'), { closeButton: false, offset: [0, -34] });
      bounds.push([origin.lat, origin.lng]);
    }
    if (destination) {
      const m = L.marker([destination.lat, destination.lng], { icon: destinationPin() }).addTo(map);
      m.bindPopup(popupHtml(destination.label ?? 'Destination', 'Destination'), { closeButton: false, offset: [0, -34] });
      bounds.push([destination.lat, destination.lng]);
    }

    if (origin && destination) {
      L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], {
        color: '#2e9e3a',
        weight: 4,
        opacity: 0.9,
        dashArray: '8 6',
        lineCap: 'round',
      }).addTo(map);
    }

    // Per-result pins (small dots). Offset slightly around the origin so many
    // pins on the same city don't stack invisibly.
    resultPins.forEach((p, idx) => {
      const jitter = jitterOffset(idx, resultPins.length);
      const lat = p.lat + jitter[0];
      const lng = p.lng + jitter[1];
      const m = L.marker([lat, lng], { icon: resultDot() }).addTo(map);
      const popup = popupHtml(p.label ?? 'Ride', p.sublabel ?? 'Ride');
      m.bindPopup(popup, { closeButton: false, offset: [0, -12] });
      if (onPinClick) m.on('click', () => onPinClick(p.id));
      bounds.push([lat, lng]);
    });

    if (bounds.length >= 2) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 10 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0] as L.LatLngExpression, 11);
    } else {
      // Rwanda-ish default view.
      map.setView([-1.9403, 29.8739], 8);
    }

    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [
    origin?.lat, origin?.lng, origin?.label,
    destination?.lat, destination?.lng, destination?.label,
    resultPins, onPinClick, theme,
  ]);

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={ariaLabel}
      className={['rounded-card overflow-hidden border border-border bg-bg-elevated', className].join(' ')}
    />
  );
}

/* ── Pins ────────────────────────────────────────────────────────────────── */

function originPin() {
  return L.divIcon({
    className: 'tj-pin',
    html: `<div style="width:34px;height:44px;transform:translate(-50%,-100%);">${pinSvg('#2e9e3a', 'A')}</div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
  });
}
function destinationPin() {
  return L.divIcon({
    className: 'tj-pin',
    html: `<div style="width:34px;height:44px;transform:translate(-50%,-100%);">${pinSvg('#0b1e40', 'B')}</div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
  });
}
function resultDot() {
  return L.divIcon({
    className: 'tj-dot',
    html: `<div style="width:16px;height:16px;transform:translate(-50%,-50%);border-radius:9999px;background:#2e9e3a;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.35);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function pinSvg(fill: string, letter: string) {
  return `
    <svg width="34" height="44" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));">
      <path d="M15 0 C6.7 0 0 6.7 0 15 c0 11.5 15 23 15 23 s15 -11.5 15 -23 C30 6.7 23.3 0 15 0 z" fill="${fill}"/>
      <circle cx="15" cy="15" r="8.5" fill="#fff"/>
      <text x="15" y="19" text-anchor="middle" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="12" font-weight="800" fill="${fill}">${letter}</text>
    </svg>`;
}

function popupHtml(name: string, kind: string) {
  const safeName = escapeHtml(name);
  const safeKind = escapeHtml(kind);
  return `
    <div style="font-family:Plus Jakarta Sans,system-ui,sans-serif;padding:2px 4px;min-width:120px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;">${safeKind}</div>
      <div style="font-size:13px;font-weight:800;color:#111827;margin-top:2px;">${safeName}</div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Small offset so many pins on the same origin city don't overlap. */
function jitterOffset(i: number, n: number): [number, number] {
  if (n <= 1) return [0, 0];
  const angle = (i / n) * Math.PI * 2;
  const r = 0.008; // ~800m
  return [Math.sin(angle) * r, Math.cos(angle) * r];
}
