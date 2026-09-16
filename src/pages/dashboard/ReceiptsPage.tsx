import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import { listMyTrips, type MyTrip } from '@/features/bookings/api';
import { formatDateTime, formatRWF } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';
import { ReceiptPrintingModal } from '@/components/ReceiptPrintingModal';
import { downloadReceiptPdf, receiptNumberFromBookingId, type ReceiptData } from '@/lib/receiptPdf';

export default function ReceiptsPage() {
  const { user, profile } = useAuth();
  const toast = useToast();

  const [printing, setPrinting] = useState<MyTrip | null>(null);

  const fetcher = useCallback(async () => {
    if (!user) return [] as MyTrip[];
    const trips = await listMyTrips(user.id);
    return trips.filter((t) => t.status === 'completed');
  }, [user]);

  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load receipts.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading } = useDataFetch<MyTrip[]>(fetcher, [user?.id], { enabled: Boolean(user), onError });
  const rows = data ?? [];

  function requestDownload(t: MyTrip) {
    if (!t.journey || !t.journey.vehicle || !t.journey.driver) {
      toast.push({ kind: 'error', message: 'This trip is missing driver or vehicle details.' });
      return;
    }
    setPrinting(t);
  }

  async function completeDownload() {
    if (!printing || !printing.journey || !printing.journey.vehicle || !printing.journey.driver) {
      setPrinting(null);
      return;
    }
    try {
      const t = printing;
      const j = t.journey!;
      const v = j.vehicle!;
      const d = j.driver!;
      const data: ReceiptData = {
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
        // Multi-seat breakdown: derive per-seat from journey's canonical value
        // (contribution_per_seat when set, else suggested_contribution). This
        // makes the receipt's small "N × RF X = TOTAL" line accurate even for
        // the older bookings that only stored a total.
        contributionPerSeat:
          j.contribution_per_seat ?? j.suggested_contribution ??
          (t.seats_booked > 0 ? Math.round((t.contribution_amount ?? 0) / t.seats_booked) : null),
        passengerName: profile?.full_name ?? 'Passenger',
        passengerNote: t.seats_booked > 1
          ? `+ ${t.seats_booked - 1} companion${t.seats_booked - 1 === 1 ? '' : 's'}`
          : null,
      };
      await downloadReceiptPdf(data);
      toast.push({ kind: 'success', title: 'Receipt downloaded', message: `Saved as TUJYANE-receipt-${data.receiptNumber}.pdf` });
    } catch (err) {
      toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not generate the PDF.' });
    } finally {
      setPrinting(null);
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
            When a trip finishes, it will appear here. You can download a receipt for expense claims.
          </CardDescription>
          <div className="mt-4"><Link to="/dashboard/find"><Button>Find a ride</Button></Link></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 grid gap-3">
      {rows.map((t) => {
        const j = t.journey;
        const dt = j ? formatDateTime(j.departure_time).full : '—';
        return (
          <Card key={t.id}>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs text-text-muted">{dt}</div>
                <div className="text-sm font-semibold text-text truncate">
                  {j ? `${j.origin_text} → ${j.destination_text}` : '—'}
                </div>
                <div className="text-xs text-text-muted">
                  {j?.driver?.full_name} · {formatRWF(t.contribution_amount ?? 0)}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => requestDownload(t)}
              >
                Download receipt
              </Button>
            </div>
          </Card>
        );
      })}
      <p className="text-xs text-text-muted text-center">
        Receipts are demo records — TUJYANE doesn't collect payments. Print or share them for expense claims.
      </p>

      {printing && <ReceiptPrintingModal onComplete={completeDownload} />}
    </div>
  );
}
