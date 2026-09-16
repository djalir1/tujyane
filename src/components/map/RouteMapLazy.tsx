import { Suspense, lazy } from 'react';
import type { Point, ResultPin } from './RouteMap';

const RouteMap = lazy(() => import('./RouteMap'));

type Props = {
  origin: Point | null;
  destination: Point | null;
  resultPins?: ResultPin[];
  onPinClick?: (id: string) => void;
  className?: string;
  ariaLabel?: string;
};

/**
 * Lazy wrapper for the Leaflet map so the ~40 KB library + CSS never load on
 * pages that don't render a route map (e.g. the landing page). Renders a
 * lightweight skeleton while the chunk is fetching.
 */
export function RouteMapLazy(props: Props) {
  const hasAny = Boolean(props.origin || props.destination || (props.resultPins && props.resultPins.length > 0));
  if (!hasAny) return <MapEmpty />;
  return (
    <Suspense fallback={<MapSkeleton />}>
      <RouteMap {...props} />
    </Suspense>
  );
}

function MapSkeleton() {
  return (
    <div
      role="img"
      aria-label="Loading map…"
      className="rounded-card border border-border bg-bg-elevated h-full w-full grid place-items-center"
    >
      <div className="text-center text-text-muted">
        <div className="animate-pulse text-2xl">🗺️</div>
        <div className="text-xs mt-1">Loading map…</div>
      </div>
    </div>
  );
}

function MapEmpty() {
  return (
    <div
      role="img"
      aria-label="Pick a route to see the map"
      className="rounded-card border border-dashed border-border bg-bg-elevated h-full w-full grid place-items-center"
    >
      <div className="text-center px-4">
        <div className="text-2xl">🗺️</div>
        <div className="text-xs font-semibold text-text mt-1">Pick both cities</div>
        <div className="text-[11px] text-text-muted mt-1">The route appears here.</div>
      </div>
    </div>
  );
}
