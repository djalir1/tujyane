export function formatRWF(v: number | null | undefined): string {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v.toLocaleString()} RWF`;
  }
}

export function formatDateTime(iso: string): { date: string; time: string; full: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const full = `${date} · ${time}`;
  return { date, time, full };
}

export function pluralSeats(n: number): string {
  return n === 1 ? '1 seat' : `${n} seats`;
}
