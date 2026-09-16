import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { TextField } from '@/components/ds/TextField';
import { DatePicker } from '@/components/ds/DatePicker';
import { Button } from '@/components/ds/Button';
import { CityAutocomplete } from '@/components/ds/CityAutocomplete';
import type { Location } from '@/features/locations/api';

const TODAY = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

/** Passenger's "Find a ride" tab. Same search bar, routes to /search. */
export default function FindRidePage() {
  const nav = useNavigate();
  const [from, setFrom] = useState<Location | null>(null);
  const [to, setTo] = useState<Location | null>(null);
  const [date, setDate] = useState<Date | null>(TODAY());
  const [pax, setPax] = useState('1');
  const [attempted, setAttempted] = useState(false);

  const paxNum = useMemo(() => Math.max(1, Number(pax) || 1), [pax]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!from || !to) return;
    const p = new URLSearchParams();
    p.set('from', from.id);
    p.set('to', to.id);
    if (date) p.set('date', date.toISOString().slice(0, 10));
    if (paxNum !== 1) p.set('pax', String(paxNum));
    nav(`/search?${p.toString()}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <Card>
        <CardTitle>Search a ride</CardTitle>
        <CardDescription>
          Pick a place from the list — that’s how we compute a fair per-seat
          contribution and match your route.
        </CardDescription>

        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <CityAutocomplete
            label="From"
            value={from}
            onChange={setFrom}
            placeholder="Kigali (Nyabugogo)…"
            error={attempted && !from ? 'Pick where you start.' : null}
          />
          <CityAutocomplete
            label="To"
            value={to}
            onChange={setTo}
            placeholder="Musanze, Gisenyi…"
            error={attempted && !to ? 'Pick where you’re going.' : null}
          />
          <DatePicker label="Date" value={date} onChange={setDate} disablePast />
          <TextField label="Passengers" type="number" inputMode="numeric" min={1} max={7}
            value={pax} onChange={(e) => setPax(e.target.value)} />
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" fullWidth>Show me rides</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
