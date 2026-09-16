-- 0013_audit_and_admin_extras.sql
-- Adds audit_events + admin RPCs (recent activity, list journeys/bookings,
-- audit log, contribution summary) and the is_demo flag on profiles.
-- The full body was applied via MCP; kept here for local record.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists audit_events_entity_idx  on public.audit_events (entity_type, entity_id);

alter table public.audit_events enable row level security;
drop policy if exists audit_events_admin_read on public.audit_events;
create policy audit_events_admin_read on public.audit_events for select using (public.is_admin(auth.uid()));

alter table public.profiles    add column if not exists is_demo boolean not null default false;
alter table public.admin_users add column if not exists last_seen_at timestamptz;

-- log_audit helper, RPC extensions to accept_booking / verify_boarding /
-- approve/reject_driver_document, insert triggers on journeys + bookings, and
-- admin_recent_activity / admin_list_journeys / admin_list_bookings /
-- admin_contribution_summary / admin_audit_events all exist in the DB — see the
-- MCP-applied migration blob for the full text.
