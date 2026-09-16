# TUJYANE

Carpooling for Rwanda. React (Vite + TS + Tailwind) frontend on Supabase (Postgres + Auth + PostGIS).

## Run locally

```bash
npm install
npm run dev
```

`.env.local` is already wired to the tujyane Supabase project. To point elsewhere, copy `.env.example`.

The seven migrations under `supabase/migrations/` are also applied on the hosted project (`nbqpmcnhyxqndohsbtqq`). Use the Supabase CLI or MCP to re-apply on a new project.

## Auth model

- Account is **optional**. Anon users can search and view journeys.
- Account is **required** to post a journey (driver) or request/book a ride (passenger).
- Two levels of gating live in `src/auth/`:
  - `ProtectedRoute` — hard gate (redirect to `/auth` with `state.from`).
  - `AuthPromptGate` — soft gate that renders a "sign in to continue" card inside an otherwise-open flow.
- Email + password is the only method enabled today. Layout is structured so phone/OTP can be dropped in as a second tab.
- Session is persisted with `storageKey: 'tujyane.auth'`, and `onAuthStateChange` refreshes the in-app profile.

## Database

### Tables

| Table | Purpose |
| --- | --- |
| `profiles` | 1:1 with `auth.users`. Auto-created via `handle_new_user()` trigger on signup. Rating aggregates maintained by trigger. |
| `admin_users` | Membership grants access to review flows (`is_admin(uid)` helper is used inside policies). |
| `vehicles` | A driver's cars. `is_verified` toggled by admin RPC only. |
| `driver_documents` | KYC evidence: national_id, driving_license, vehicle_registration, car_photo. Feeds admin review queue. |
| `journeys` | A driver's offered trip. PostGIS `geography(Point)` on origin + destination. |
| `bookings` | A passenger's request/seat on a journey. Boarding code is issued only on accept. |
| `ratings` | 1–5 rating a participant leaves after `booking.status='completed'`. |

### RLS summary

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | Everyone (name / avatar / rating are public). | Only self via update. Insert done by signup trigger. |
| `vehicles` | Anyone: verified only. Owner: own. Admin: all. | Owner insert/update/delete their own. `is_verified` only via admin RPC. |
| `driver_documents` | Only the owning driver or an admin. | Driver may write while `status='pending'`. Admin approves/rejects **through RPC**. |
| `journeys` | Anyone: `status='active'`. Owner + passengers who booked keep visibility across transitions. Admin: all. | Only owner can insert/update/delete. Seat count only mutated by RPCs. |
| `bookings` | Passenger who made it, driver of the journey, or admin. | Passenger inserts (`status='requested'` only). Passenger can only update to `cancelled`. Driver can update to `rejected / boarding / in_trip / completed / no_show`. `accepted` requires the `accept_booking` RPC. |
| `ratings` | Public (aggregates). | Insert only by a participant of a completed booking, and only rating the counterparty. |
| `admin_users` | Only admins. | Only `super_admin` may add or remove admins. |

Every policy carries a SQL `COMMENT ON POLICY …` explaining the intent.

### Operations that must go through server-side (RPC / Edge Function), not direct client writes

RLS alone can't enforce these safely; use the SECURITY DEFINER functions in `0006_rpcs_booking_lifecycle.sql`:

- `accept_booking(booking_id)` — locks the journey row, verifies capacity, decrements `seats_available`, flips `status` to `'full'` if that hits zero, generates the 4-digit boarding code, and moves the booking to `accepted`. All atomic under `FOR UPDATE`.
- `cancel_booking(booking_id)` — passenger cancels; if the booking was previously `accepted`, seats are restored and a `full` journey re-opens to `active`.
- `verify_boarding(booking_id, code)` — driver enters the 4-digit code the passenger shows; flips the booking to `boarding` if it matches.
- `approve_driver_document(doc_id)` — admin approves a KYC doc and re-derives `profiles.is_verified_driver` from the set of approved doc types.
- `reject_driver_document(doc_id, reason)` — admin rejects with a reason.

Additional flows that will be moved to server-side once implemented:

- Payment/MoMo callback → set `bookings.payment_status='manual_paid'` (webhook signed).
- Recurring-journey materialisation from `recurrence` (edge function / pg_cron).
- Rating write path may migrate to an RPC if we want atomic booking-side flags alongside the rating insert.

The first `super_admin` must be inserted manually via SQL editor:

```sql
insert into public.admin_users (id, role) values ('<profile-uuid>', 'super_admin');
```

## File layout

```
src/
  auth/
    AuthProvider.tsx      # context — session, profile, signIn/Up/Out
    useAuth.ts
    ProtectedRoute.tsx    # hard gate
    AuthPromptGate.tsx    # soft gate ("you need an account to do this")
  components/ds/          # design system: TextField, Button, RadioGroup, Tabs, Card
  lib/
    supabase.ts           # typed browser client
    database.types.ts     # enum types (regenerate with `supabase gen types`)
    validators.ts         # email, Rwandan phone (+250 / 07…), password strength
  pages/
    AuthPage.tsx          # /auth — Sign in / Create account tabs
    HomePage.tsx          # /
    TripsPage.tsx         # /trips — behind ProtectedRoute
supabase/migrations/      # 0001 → 0007
```
