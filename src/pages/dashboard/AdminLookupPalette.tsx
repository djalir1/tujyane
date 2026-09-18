import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLookup, type LookupHit } from '@/features/admin/api';
import { useToast } from '@/components/ds/Toast';

/**
 * Admin global ID lookup.
 *
 * Two entry points, one palette:
 *   * Ctrl/Cmd-K anywhere in the /admin shell
 *   * "Search…" pill in the admin header
 *
 * Accepts a UUID (booking / journey / user / vehicle), a plate string, or an
 * email. Renders each hit as a card with a "Copy id" affordance and a "Go"
 * button that navigates to the matching admin page.
 */
export function AdminLookupPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const toast = useToast();

  // Debounced search — every keystroke would hammer the RPC otherwise.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 3) { setHits([]); setErr(null); return; }
    let alive = true;
    setLoading(true); setErr(null);
    const h = setTimeout(async () => {
      try {
        const r = await adminLookup(query);
        if (alive) setHits(r);
      } catch (e) {
        if (alive) { setHits([]); setErr(e instanceof Error ? e.message : 'Search failed.'); }
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q, open]);

  // Reset + focus when opening; Esc closes.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 20);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onCopy = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.push({ kind: 'success', message: 'ID copied.' });
    } catch {
      toast.push({ kind: 'error', message: 'Copy failed.' });
    }
  }, [toast]);

  const goTo = useCallback((path: string) => { onClose(); nav(path); }, [nav, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Admin lookup"
      className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-24 bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-card border border-border bg-bg-elevated shadow-elevate overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <SearchIcon />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Paste an ID, plate (RAB 123 A), or email…"
            className="flex-1 bg-transparent outline-none text-sm text-text placeholder:text-text-subtle"
          />
          <kbd className="hidden sm:inline text-[10px] font-semibold text-text-subtle border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 3 ? (
            <div className="p-6 text-sm text-text-muted">
              Type at least 3 characters to search. UUIDs, plate numbers, and email addresses are supported.
            </div>
          ) : loading ? (
            <div className="p-6 text-sm text-text-muted">Searching…</div>
          ) : err ? (
            <div className="p-6 text-sm text-danger">{err}</div>
          ) : hits.length === 0 ? (
            <div className="p-6 text-sm text-text-muted">Nothing found.</div>
          ) : (
            <ul className="divide-y divide-border">
              {hits.map((h, i) => (
                <li key={i} className="p-4">
                  <ResultCard hit={h} onCopy={onCopy} onGo={goTo} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  hit, onCopy, onGo,
}: { hit: LookupHit; onCopy: (id: string) => void; onGo: (path: string) => void }) {
  if (hit.kind === 'booking') return <BookingCard hit={hit} onCopy={onCopy} onGo={onGo} />;
  if (hit.kind === 'journey') return <JourneyCard hit={hit} onCopy={onCopy} onGo={onGo} />;
  if (hit.kind === 'user')    return <UserCard    hit={hit} onCopy={onCopy} onGo={onGo} />;
  if (hit.kind === 'vehicle') return <VehicleCard hit={hit} onCopy={onCopy} onGo={onGo} />;
  return <pre className="text-xs">{JSON.stringify(hit, null, 2)}</pre>;
}

type Obj = Record<string, unknown>;
const s = (o: unknown, k: string): string => {
  const v = (o as Obj | null | undefined)?.[k];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
};
const n = (o: unknown, k: string): number => {
  const v = (o as Obj | null | undefined)?.[k];
  return typeof v === 'number' ? v : 0;
};

function BookingCard({ hit, onCopy, onGo }: { hit: LookupHit; onCopy: (id: string) => void; onGo: (path: string) => void }) {
  const b = hit.booking as Obj; const j = hit.journey as Obj; const pp = hit.passenger as Obj; const pd = hit.driver as Obj;
  const bid = s(b, 'id'), jid = s(j, 'id');
  return (
    <>
      <Header kind="Booking" id={bid} onCopy={onCopy} />
      <div className="mt-1.5 text-sm text-text">
        {s(pp, 'full_name') || 'Passenger'} → {s(pd, 'full_name') || 'Driver'} · {s(b, 'status')}
      </div>
      <div className="text-xs text-text-muted">
        {s(j, 'origin_text')} → {s(j, 'destination_text')}
      </div>
      <Actions>
        {jid && <ActionBtn onClick={() => onGo(`/journeys/${jid}/manage`)}>Manage journey</ActionBtn>}
        <ActionBtn onClick={() => onGo(`/admin/bookings`)}>Open bookings list</ActionBtn>
      </Actions>
    </>
  );
}

function JourneyCard({ hit, onCopy, onGo }: { hit: LookupHit; onCopy: (id: string) => void; onGo: (path: string) => void }) {
  const j = hit.journey as Obj; const pd = hit.driver as Obj; const v = hit.vehicle as Obj;
  const jid = s(j, 'id');
  const bookings = (hit.bookings as unknown[] | undefined) ?? [];
  return (
    <>
      <Header kind="Journey" id={jid} onCopy={onCopy} />
      <div className="mt-1.5 text-sm text-text">
        {s(j, 'origin_text')} → {s(j, 'destination_text')} · {s(j, 'status')}
      </div>
      <div className="text-xs text-text-muted">
        Driver {s(pd, 'full_name') || '—'} · {s(v, 'make')} {s(v, 'model')} · {bookings.length} booking{bookings.length === 1 ? '' : 's'}
      </div>
      <Actions>
        <ActionBtn onClick={() => onGo(`/journeys/${jid}`)}>Open detail</ActionBtn>
        <ActionBtn onClick={() => onGo(`/journeys/${jid}/manage`)}>Manage</ActionBtn>
      </Actions>
    </>
  );
}

function UserCard({ hit, onCopy, onGo }: { hit: LookupHit; onCopy: (id: string) => void; onGo: (path: string) => void }) {
  const p = hit.profile as Obj;
  const uid = s(p, 'id');
  const email = s(hit as unknown as Obj, 'email');
  return (
    <>
      <Header kind="User" id={uid} onCopy={onCopy} />
      <div className="mt-1.5 text-sm text-text">
        {s(p, 'full_name') || '—'}
        {(p as Obj).is_verified_driver ? ' · verified driver' : ''}
      </div>
      <div className="text-xs text-text-muted">
        {email || s(p, 'phone') || '—'} · {n(hit as unknown as Obj, 'journeys_count')} journeys · {n(hit as unknown as Obj, 'bookings_count')} bookings
      </div>
      <Actions>
        <ActionBtn onClick={() => onGo(`/admin/drivers/${uid}`)}>Open driver review</ActionBtn>
        <ActionBtn onClick={() => onGo(`/admin/users`)}>Open users list</ActionBtn>
      </Actions>
    </>
  );
}

function VehicleCard({ hit, onCopy, onGo }: { hit: LookupHit; onCopy: (id: string) => void; onGo: (path: string) => void }) {
  const v = hit.vehicle as Obj; const p = hit.owner as Obj;
  const vid = s(v, 'id');
  const owner = s(p, 'id');
  const docs = (hit.documents as unknown[] | undefined) ?? [];
  return (
    <>
      <Header kind="Vehicle" id={vid} onCopy={onCopy} />
      <div className="mt-1.5 text-sm text-text">
        {s(v, 'plate_number') || '—'} · {s(v, 'make')} {s(v, 'model')} {(v as Obj).is_verified ? '· verified' : '· unverified'}
      </div>
      <div className="text-xs text-text-muted">
        Owner {s(p, 'full_name') || '—'} · {docs.length} document{docs.length === 1 ? '' : 's'}
      </div>
      <Actions>
        {owner && <ActionBtn onClick={() => onGo(`/admin/drivers/${owner}`)}>Open owner review</ActionBtn>}
      </Actions>
    </>
  );
}

function Header({ kind, id, onCopy }: { kind: string; id: string; onCopy: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand">
        {kind}
      </span>
      <code className="text-xs text-text-muted truncate">{id || '—'}</code>
      {id && (
        <button
          type="button"
          onClick={() => onCopy(id)}
          className="ml-auto text-[11px] font-semibold text-text-muted hover:text-text px-2 py-0.5 rounded-full border border-border hover:bg-surface-hover shrink-0"
          aria-label={`Copy ${kind.toLowerCase()} id`}
        >
          Copy id
        </button>
      )}
    </div>
  );
}
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-2">{children}</div>;
}
function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold text-brand hover:text-brand-hover px-2 py-1 rounded-pill border border-brand/30 hover:bg-brand/10"
    >
      {children}
    </button>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className="text-text-muted shrink-0">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Header search pill that opens the palette when clicked, plus Ctrl-K wiring. */
export function AdminLookupTrigger() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setOpen((o) => !o); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const shortcut = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Ctrl K';
    return navigator.platform.toLowerCase().includes('mac') ? '⌘ K' : 'Ctrl K';
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 h-10 px-3 rounded-pill bg-bg-elevated border border-border text-xs font-semibold text-text-muted hover:text-text hover:bg-surface-hover"
        aria-label="Search admin (Ctrl+K)"
      >
        <SearchIcon />
        <span>Lookup…</span>
        <kbd className="border border-border rounded px-1 py-0.5 text-[9px] font-semibold">{shortcut}</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-full bg-bg-elevated border border-border text-text-muted"
        aria-label="Search admin"
      >
        <SearchIcon />
      </button>
      <AdminLookupPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
