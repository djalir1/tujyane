import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import {
  listMyDriverReceipts, listMyTrips,
  type MyDriverReceipt, type MyTrip,
} from '@/features/bookings/api';
import { formatDateTime, formatRWF } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';
import { downloadReceiptPdf, receiptNumberFromBookingId, type ReceiptData } from '@/lib/receiptPdf';

/** Normalized shape so passenger and driver views render with the same row. */
type ReceiptRow = {
  id: string;
  origin: string;
  destination: string;
  departureIso: string | null;
  otherPartyName: string;    // for driver: passenger name; for passenger: driver name
  otherPartyRole: 'Passenger' | 'Driver';
  seats: number;
  contributionAmount: number;
  buildData: (issuerName: string) => ReceiptData | null;
};

function receiptRowFromMyTrip(t: MyTrip): ReceiptRow | null {
  const j = t.journey; if (!j || !j.vehicle || !j.driver) return null;
  const v = j.vehicle; const d = j.driver;
  return {
    id: t.id,
    origin: j.origin_text,
    destination: j.destination_text,
    departureIso: j.departure_time,
    otherPartyName: d.full_name,
    otherPartyRole: 'Driver',
    seats: t.seats_booked,
    contributionAmount: t.contribution_amount ?? 0,
    buildData: (issuerName) => ({
      receiptNumber: receiptNumberFromBookingId(t.id),
      issuedAt: new Date(),
      travelledAt: new Date(j.departure_time),
      origin: j.origin_text,
      destination: j.destination_text,
      driverName: d.full_name,
      driverVerified: d.is_verified_driver,
      vehicleMakeModel: `${v.make} ${v.model}`,
      vehicleYear: v.year,
      vehiclePlate: v.plate_number,
      vehicleEnergyType: v.energy_type,
      seats: t.seats_booked,
      contributionAmount: t.contribution_amount ?? 0,
      contributionPerSeat:
        j.contribution_per_seat ?? j.suggested_contribution ??
        (t.seats_booked > 0 ? Math.round((t.contribution_amount ?? 0) / t.seats_booked) : null),
      passengerName: issuerName || 'Passenger',
      passengerNote: t.seats_booked > 1
        ? `+ ${t.seats_booked - 1} companion${t.seats_booked - 1 === 1 ? '' : 's'}`
        : null,
      status: statusLabel(t.status),
    }),
  };
}

function receiptRowFromDriverBooking(b: MyDriverReceipt): ReceiptRow | null {
  const j = b.journey; if (!j || !j.vehicle || !j.driver) return null;
  const v = j.vehicle; const d = j.driver;
  return {
    id: b.id,
    origin: j.origin_text,
    destination: j.destination_text,
    departureIso: j.departure_time,
    otherPartyName: b.passenger?.full_name ?? 'Passenger',
    otherPartyRole: 'Passenger',
    seats: b.seats_booked,
    contributionAmount: b.contribution_amount ?? 0,
    buildData: () => ({
      receiptNumber: receiptNumberFromBookingId(b.id),
      issuedAt: new Date(),
      travelledAt: new Date(j.departure_time),
      origin: j.origin_text,
      destination: j.destination_text,
      driverName: d.full_name,
      driverVerified: d.is_verified_driver,
      vehicleMakeModel: `${v.make} ${v.model}`,
      vehicleYear: v.year,
      vehiclePlate: v.plate_number,
      vehicleEnergyType: v.energy_type,
      seats: b.seats_booked,
      contributionAmount: b.contribution_amount ?? 0,
      contributionPerSeat:
        j.contribution_per_seat ?? j.suggested_contribution ??
        (b.seats_booked > 0 ? Math.round((b.contribution_amount ?? 0) / b.seats_booked) : null),
      passengerName: b.passenger?.full_name ?? 'Passenger',
      passengerNote: b.seats_booked > 1
        ? `+ ${b.seats_booked - 1} companion${b.seats_booked - 1 === 1 ? '' : 's'}`
        : null,
      status: statusLabel(b.status),
    }),
  };
}

function statusLabel(s: string | null | undefined): string {
  switch (s) {
    case 'completed': return 'Completed';
    case 'accepted':  return 'Confirmed';
    case 'boarding':  return 'Boarding';
    case 'in_trip':   return 'In trip';
    case 'cancelled': return 'Cancelled';
    default:          return 'Confirmed';
  }
}

/** Per-row download state. Powers the "Preparing… → Downloaded ✓" affordance
 * so the driver/passenger has an immediate, tasteful confirmation instead of
 * relying only on the browser's download shelf. */
type DownloadState = 'idle' | 'preparing' | 'done' | 'error';

export default function ReceiptsPage() {
  const { user, profile } = useAuth();
  const toast = useToast();

  // Show whichever list the current user actually has data for. Drivers who
  // are ALSO passengers see both — sorted by date, most recent first.
  const isDriver = profile?.role_intent === 'driver' || profile?.role_intent === 'both';
  const isPassenger = profile?.role_intent === 'passenger' || profile?.role_intent === 'both';

  const fetcher = useCallback(async () => {
    if (!user) return [] as ReceiptRow[];
    const [trips, driverReceipts] = await Promise.all([
      isPassenger ? listMyTrips(user.id) : Promise.resolve([] as MyTrip[]),
      isDriver    ? listMyDriverReceipts(user.id) : Promise.resolve([] as MyDriverReceipt[]),
    ]);
    const rows: ReceiptRow[] = [];
    for (const t of trips) {
      if (t.status !== 'completed') continue;
      const r = receiptRowFromMyTrip(t); if (r) rows.push(r);
    }
    for (const b of driverReceipts) {
      const r = receiptRowFromDriverBooking(b); if (r) rows.push(r);
    }
    rows.sort((a, b) => (b.departureIso ?? '').localeCompare(a.departureIso ?? ''));
    return rows;
  }, [user, isDriver, isPassenger]);

  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load receipts.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading } = useDataFetch<ReceiptRow[]>(fetcher, [user?.id, isDriver, isPassenger], { enabled: Boolean(user), onError });
  const rows = data ?? [];
  const [states, setStates] = useState<Record<string, DownloadState>>({});
  const issuerName = useMemo(() => profile?.full_name ?? '', [profile?.full_name]);

  async function onDownload(r: ReceiptRow) {
    setStates((prev) => ({ ...prev, [r.id]: 'preparing' }));
    try {
      const receiptData = r.buildData(issuerName);
      if (!receiptData) throw new Error('This trip is missing driver or vehicle details.');
      await downloadReceiptPdf(receiptData);
      setStates((prev) => ({ ...prev, [r.id]: 'done' }));
      toast.push({ kind: 'success', title: 'Downloaded', message: `Saved TUJYANE-receipt-${receiptData.receiptNumber}.pdf` });
      // Reset the button back to idle after a moment so it's clickable again.
      setTimeout(() => setStates((prev) => {
        if (prev[r.id] !== 'done') return prev;
        const { [r.id]: _dropped, ...rest } = prev;
        void _dropped;
        return rest;
      }), 2500);
    } catch (err) {
      setStates((prev) => ({ ...prev, [r.id]: 'error' }));
      toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not generate the PDF.' });
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 grid gap-3">
        <Skeleton heightClass="h-16" />
        <Skeleton heightClass="h-16" />
        <Skeleton heightClass="h-16" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Card>
          <CardTitle>No receipts yet</CardTitle>
          <CardDescription>
            {isDriver
              ? 'Receipts appear here after a passenger completes a trip on one of your journeys.'
              : 'When a trip finishes, it will appear here.'}
          </CardDescription>
          <div className="mt-4">
            {isDriver
              ? <Link to="/dashboard/journeys/new"><Button>Post a journey</Button></Link>
              : <Link to="/dashboard/find"><Button>Find a ride</Button></Link>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 grid gap-3">
      {rows.map((r) => {
        const dt = r.departureIso ? formatDateTime(r.departureIso).full : '—';
        const state = states[r.id] ?? 'idle';
        return (
          <Card key={r.id}>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-text-muted">{dt}</div>
                <div className="text-sm font-semibold text-text min-w-0">
                  <div className="truncate">{r.origin}</div>
                  <div className="truncate flex items-center gap-1">
                    <span className="text-text-subtle shrink-0">{'→'}</span>
                    <span className="truncate">{r.destination}</span>
                  </div>
                </div>
                <div className="text-xs text-text-muted truncate">
                  {r.otherPartyRole}: {r.otherPartyName} · {formatRWF(r.contributionAmount)}
                </div>
              </div>
              <DownloadButton state={state} onClick={() => onDownload(r)} />
            </div>
          </Card>
        );
      })}
      <p className="text-xs text-text-muted text-center">
        Receipts are demo records — TUJYANE doesn’t collect payments. Print or share them for expense claims.
      </p>
    </div>
  );
}

function DownloadButton({ state, onClick }: { state: DownloadState; onClick: () => void }) {
  if (state === 'preparing') {
    return <Button size="sm" variant="outline" loading disabled>Preparing…</Button>;
  }
  if (state === 'done') {
    return (
      <Button size="sm" variant="outline" disabled className="!text-brand !border-brand/40 !bg-brand/10">
        {'✓'} Downloaded
      </Button>
    );
  }
  return <Button size="sm" variant="outline" onClick={onClick}>Download receipt</Button>;
}
