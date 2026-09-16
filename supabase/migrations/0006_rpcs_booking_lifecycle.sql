-- 0006_rpcs_booking_lifecycle.sql
-- SECURITY DEFINER RPCs for transitions RLS alone can't do safely.

create or replace function public.generate_boarding_code()
returns text
language plpgsql
set search_path = public
as $$
begin
  return lpad((floor(random() * 10000))::int::text, 4, '0');
end $$;

create or replace function public.accept_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_journey public.journeys;
  v_code text;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  if v_booking.status <> 'requested' then raise exception 'booking_not_in_requested_state' using errcode = 'P0001'; end if;

  select * into v_journey from public.journeys where id = v_booking.journey_id for update;
  if v_journey.driver_id <> auth.uid() then raise exception 'not_journey_driver' using errcode = '42501'; end if;
  if v_journey.status <> 'active' then raise exception 'journey_not_active' using errcode = 'P0001'; end if;
  if v_journey.seats_available < v_booking.seats_booked then raise exception 'no_capacity' using errcode = 'P0001'; end if;

  update public.journeys
     set seats_available = seats_available - v_booking.seats_booked,
         status = case when seats_available - v_booking.seats_booked = 0 then 'full'::public.journey_status
                       else status end
   where id = v_journey.id;

  v_code := public.generate_boarding_code();

  update public.bookings
     set status = 'accepted',
         boarding_code = v_code,
         contribution_amount = coalesce(contribution_amount, v_journey.suggested_contribution * v_booking.seats_booked)
   where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end $$;

revoke all on function public.accept_booking(uuid) from public, anon;
grant execute on function public.accept_booking(uuid) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare v_booking public.bookings; v_journey public.journeys;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  if v_booking.passenger_id <> auth.uid() then raise exception 'not_booking_owner' using errcode = '42501'; end if;
  if v_booking.status in ('completed','cancelled','no_show') then raise exception 'booking_terminal' using errcode = 'P0001'; end if;

  select * into v_journey from public.journeys where id = v_booking.journey_id for update;

  if v_booking.status = 'accepted' then
    update public.journeys
       set seats_available = seats_available + v_booking.seats_booked,
           status = case when status = 'full'::public.journey_status then 'active'::public.journey_status else status end
     where id = v_journey.id;
  end if;

  update public.bookings set status = 'cancelled' where id = v_booking.id
  returning * into v_booking;
  return v_booking;
end $$;

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

create or replace function public.verify_boarding(p_booking_id uuid, p_code text)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare v_booking public.bookings; v_journey public.journeys;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  select * into v_journey from public.journeys where id = v_booking.journey_id;
  if v_journey.driver_id <> auth.uid() then raise exception 'not_journey_driver' using errcode = '42501'; end if;
  if v_booking.status <> 'accepted' then raise exception 'booking_not_accepted' using errcode = 'P0001'; end if;
  if v_booking.boarding_code is null or v_booking.boarding_code <> p_code then raise exception 'bad_code' using errcode = 'P0001'; end if;

  update public.bookings set status = 'boarding' where id = v_booking.id returning * into v_booking;
  return v_booking;
end $$;

revoke all on function public.verify_boarding(uuid, text) from public, anon;
grant execute on function public.verify_boarding(uuid, text) to authenticated;

create or replace function public.approve_driver_document(p_doc_id uuid)
returns public.driver_documents
language plpgsql
security definer
set search_path = public
as $$
declare v_doc public.driver_documents;
begin
  if not public.is_admin(auth.uid()) then raise exception 'not_admin' using errcode = '42501'; end if;

  update public.driver_documents
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
   where id = p_doc_id
  returning * into v_doc;

  update public.profiles
     set is_verified_driver = (
       (select count(distinct doc_type)
          from public.driver_documents
         where driver_id = v_doc.driver_id
           and status = 'approved'
           and doc_type in ('national_id','driving_license')
       ) = 2
     )
   where id = v_doc.driver_id;

  return v_doc;
end $$;

revoke all on function public.approve_driver_document(uuid) from public, anon;
grant execute on function public.approve_driver_document(uuid) to authenticated;

create or replace function public.reject_driver_document(p_doc_id uuid, p_reason text)
returns public.driver_documents
language plpgsql
security definer
set search_path = public
as $$
declare v_doc public.driver_documents;
begin
  if not public.is_admin(auth.uid()) then raise exception 'not_admin' using errcode = '42501'; end if;

  update public.driver_documents
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
   where id = p_doc_id
  returning * into v_doc;

  return v_doc;
end $$;

revoke all on function public.reject_driver_document(uuid, text) from public, anon;
grant execute on function public.reject_driver_document(uuid, text) to authenticated;
