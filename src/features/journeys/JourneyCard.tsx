import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';
import { contributionOf, type JourneyWithJoins } from './api';
import { findCorridorFare, listCorridorFares, type CorridorFare } from '@/features/locations/api';

export function JourneyCard({ j }: { j: JourneyWithJoins }) {
  const dt = formatDateTime(j.departure_time);
  const rating = j.driver?.rating_count ? j.driver.rating_avg.toFixed(1) : '—';
  const ev = j.vehicle?.energy_type === 'electric';

  // Bus-fare comparison — loaded once per session (module-cached), so a page
  // with 20 cards causes exactly one network round-trip.
  const [fares, setFares] = useState<CorridorFare[]>([]);
  useEffect(() => {
    let alive = true;
    void listCorridorFares().then((rows) => { if (alive) setFares(rows); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const busFare = findCorridorFare(fares, j.origin_location_id, j.destination_location_id);
  const contribution = contributionOf(j);
  const cheaperByPct = busFare != null && busFare > contribution
    ? Math.round(((busFare - contribution) / busFare) * 100)
    : null;

  return (
    <Card padded>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
            <span className="t-caption !normal-case tracking-normal">{dt.date}</span>
            <span aria-hidden>•</span>
            <span>{dt.time}</span>
            {cheaperByPct != null && (
              <span
                title={`Bus reference: ${formatRWF(busFare!)}`}
                className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand"
              >
                Cheaper than the bus · save ~{cheaperByPct}%
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3 min-w-0">
            <div className="flex flex-col items-center pt-1 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              <span className="w-px flex-1 bg-border my-1 min-h-4" />
              <span className="w-2.5 h-2.5 rounded-full border border-brand" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text truncate">{j.origin_text}</div>
              <div className="text-sm font-semibold text-text truncate">{j.destination_text}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 min-w-0">
            <Avatar name={j.driver?.full_name ?? 'Driver'} url={j.driver?.avatar_url ?? null} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text truncate">
                {j.driver?.full_name ?? 'Driver'}
                {j.driver?.is_verified_driver && <VerifiedBadge />}
              </div>
              <div className="text-xs text-text-muted flex items-center gap-1.5">
                <StarIcon />
                <span>{rating}{j.driver?.rating_count ? ` (${j.driver.rating_count})` : ''}</span>
                {j.vehicle && (
                  <>
                    <span aria-hidden>•</span>
                    <span className="truncate">{j.vehicle.make} {j.vehicle.model}</span>
                    {ev && <span title="Electric vehicle" className="ml-1">⚡</span>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full sm:w-44 flex items-center sm:flex-col justify-between sm:items-end gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-lg font-bold text-text tabular-nums truncate">{formatRWF(contributionOf(j))}</div>
            <div className="text-xs text-text-muted truncate">
              {pluralSeats(j.seats_available)} left
            </div>
          </div>
          <Link to={`/journeys/${j.id}`} className="shrink-0 sm:w-full">
            <Button size="sm" fullWidth>View</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  if (url) {
    return <img src={url} alt="" className="h-10 w-10 rounded-full object-cover border border-border" />;
  }
  return (
    <span
      className="h-10 w-10 rounded-full grid place-items-center bg-navy text-white text-sm font-semibold shrink-0"
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span title="Verified driver" className="ml-1 inline-flex align-middle text-brand" aria-label="Verified driver">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
        <path
          d="M12 2l2.4 1.6 2.8-.4 1.2 2.5 2.5 1.2-.4 2.8L22 12l-1.6 2.4.4 2.8-2.5 1.2-1.2 2.5-2.8-.4L12 22l-2.4-1.6-2.8.4-1.2-2.5L3.1 17l.4-2.8L2 12l1.6-2.4-.4-2.8L5.7 5.6 6.9 3.1l2.8.4L12 2z"
          fill="currentColor" opacity="0.9"
        />
        <path d="M8.5 12.4l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden className="text-warning">
      <path d="M12 17.3l-6.2 3.3 1.2-6.9L2 8.9l6.9-1L12 1.6l3.1 6.3 6.9 1-5 4.8 1.2 6.9z" />
    </svg>
  );
}
