-- 0001_extensions_and_enums.sql
-- Foundations: PostGIS for geography types (routes/points), pgcrypto for gen_random_uuid & random bytes.

create extension if not exists postgis;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Enums ----------
do $$ begin
  create type public.role_intent as enum ('passenger', 'driver', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.energy_type as enum ('petrol', 'diesel', 'hybrid', 'electric');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_type as enum ('national_id', 'driving_license', 'vehicle_registration', 'car_photo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.recurrence as enum ('once', 'daily', 'weekdays', 'weekends', 'weekly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.journey_status as enum ('active', 'full', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum (
    'requested', 'accepted', 'rejected',
    'boarding', 'in_trip', 'completed',
    'cancelled', 'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'manual_paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.admin_role as enum ('super_admin', 'reviewer');
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
