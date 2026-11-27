-- =============================================================================
-- 0126 — Check in from the app, at the venue (client, 23 Nov).
--
-- An attendee checks in from My events on the day; the app sends the phone's
-- location and this database decides whether they're close enough to the venue
-- (default 2 miles, editable per event by an admin). The venue QR stays as the
-- fallback when location doesn't work: scanning it needs no location, because
-- the code being at the venue is the proof.
--
--   (1) Venue coordinates on event_listings (the artist picks the venue with
--       Google Places) and sponsored_events (copied from the listing when the
--       partnership is created, or later if it had none; an admin can correct
--       it). `checkin_radius_m` per sponsored event, default 3219 m (2 miles).
--       Parties can't change a sponsorship's venue/radius — admin only
--       (`sponsored_events_venue`), like the rest of a confirmed deal (0061).
--   (2) `check_in_at_location()` — the location check-in. Same rules as the
--       QR (own registration, event live, the event's own day) plus: the event
--       has coordinates, the reading is precise enough (≤ 1000 m), and the
--       distance to the venue is within the radius. Every attempt is logged in
--       admin-only `checkin_attempts` (coordinates rounded to ~100 m, cleared
--       after 90 days by `purge_checkin_locations()`), which also limits a
--       person to 20 attempts an hour. The participation itself only records
--       how they checked in and how far away they were — never coordinates —
--       because the artist and brand can read participations.
--   (3) BUG FIX: `confirm_attendance()` (QR) and the artist's manual check-in
--       both still required `participations.selected`, but selection was
--       retired on 7 Nov — so since then only an admin could check anyone in.
--       The QR no longer asks for it, and the artist's check-in moves to
--       `artist_check_in_participant()` (definer; says why when it can't).
--   (4) `participations.checkin_method` — location / qr / artist / admin —
--       stamped by each path; clients can't write it or the distance fields.
--
-- Additive and re-runnable. Apply after 0123 (this re-declares
-- confirm_attendance() with 0123's event-day rule).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.event_listings
  add column if not exists venue_address  text,
  add column if not exists venue_place_id text,
  add column if not exists venue_lat      double precision,
  add column if not exists venue_lng      double precision;

alter table public.sponsored_events
  add column if not exists venue_address    text,
  add column if not exists venue_place_id   text,
  add column if not exists venue_lat        double precision,
  add column if not exists venue_lng        double precision,
  add column if not exists checkin_radius_m integer not null default 3219;

alter table public.participations
  add column if not exists checkin_method     text,
  add column if not exists checkin_distance_m integer,
  add column if not exists checkin_accuracy_m integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_listings_venue_coords') then
    alter table public.event_listings add constraint event_listings_venue_coords check (
      (venue_lat is null and venue_lng is null)
      or (venue_lat between -90 and 90 and venue_lng between -180 and 180));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sponsored_events_venue_coords') then
    alter table public.sponsored_events add constraint sponsored_events_venue_coords check (
      (venue_lat is null and venue_lng is null)
      or (venue_lat between -90 and 90 and venue_lng between -180 and 180));
  end if;
  -- 150 m – 50 km (0.1 – 31 miles).
  if not exists (select 1 from pg_constraint where conname = 'sponsored_events_checkin_radius') then
    alter table public.sponsored_events add constraint sponsored_events_checkin_radius
      check (checkin_radius_m between 150 and 50000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'participations_checkin_method') then
    alter table public.participations add constraint participations_checkin_method
      check (checkin_method is null or checkin_method in ('location', 'qr', 'artist', 'admin'));
  end if;
end $$;

-- Already checked in before this migration: we don't know how, so it stays null.

-- -----------------------------------------------------------------------------
-- 2. Check-in attempts (admin-only evidence + rate limit)
-- -----------------------------------------------------------------------------
create table if not exists public.checkin_attempts (
  id                 uuid primary key default gen_random_uuid(),
  participation_id   uuid references public.participations (id) on delete cascade,
  sponsored_event_id uuid references public.sponsored_events (id) on delete cascade,
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  result             text not null,
  -- Rounded to 3 decimal places (~100 m) and cleared after 90 days.
  lat                double precision,
  lng                double precision,
  accuracy_m         integer,
  distance_m         integer,
  created_at         timestamptz not null default now()
);
create index if not exists checkin_attempts_profile_idx on public.checkin_attempts (profile_id, created_at desc);
create index if not exists checkin_attempts_event_idx on public.checkin_attempts (sponsored_event_id, created_at desc);
create index if not exists checkin_attempts_purge_idx on public.checkin_attempts (created_at) where lat is not null;

alter table public.checkin_attempts enable row level security;
drop policy if exists "checkin_attempts: admin read" on public.checkin_attempts;
create policy "checkin_attempts: admin read" on public.checkin_attempts
  for select using (public.is_admin());
-- No write policies: only the definer functions below write here.

-- -----------------------------------------------------------------------------
-- 3. Distance (haversine, metres). No PostGIS needed at this scale.
-- -----------------------------------------------------------------------------
create or replace function public.geo_distance_m(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = public
as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )));
$$;

-- -----------------------------------------------------------------------------
-- 4. Who may change the venue / radius / check-in fields
-- -----------------------------------------------------------------------------
-- sponsored_events: admin (or a definer function / the service role) only. On
-- insert by a party (legacy self-serve proposal) the venue always comes from
-- the listing. Either way, a row without coordinates takes the listing's.
create or replace function public.sponsored_events_venue()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_listing record;
begin
  if public.is_untrusted_writer() then
    if tg_op = 'INSERT' then
      new.venue_address := null;
      new.venue_place_id := null;
      new.venue_lat := null;
      new.venue_lng := null;
      new.checkin_radius_m := 3219;
    elsif new.venue_address is distinct from old.venue_address
       or new.venue_place_id is distinct from old.venue_place_id
       or new.venue_lat is distinct from old.venue_lat
       or new.venue_lng is distinct from old.venue_lng
       or new.checkin_radius_m is distinct from old.checkin_radius_m then
      raise exception 'Only the Live·En·Synergy team can change the venue location or check-in radius'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' and new.venue_lat is null and new.listing_id is not null then
    select venue_address, venue_place_id, venue_lat, venue_lng
      into v_listing
      from public.event_listings where id = new.listing_id;
    if found and v_listing.venue_lat is not null then
      new.venue_address := v_listing.venue_address;
      new.venue_place_id := v_listing.venue_place_id;
      new.venue_lat := v_listing.venue_lat;
      new.venue_lng := v_listing.venue_lng;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sponsored_events_venue() from public, anon, authenticated;

drop trigger if exists sponsored_events_venue on public.sponsored_events;
create trigger sponsored_events_venue
  before insert or update on public.sponsored_events
  for each row execute function public.sponsored_events_venue();

-- An artist who adds (or fixes) the venue on their listing after the match
-- fills any of its open partnerships that have no location yet. Never
-- overwrites a location that is already set (an admin's correction stands).
create or replace function public.event_listings_venue_to_sponsorships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.venue_lat is not null then
    update public.sponsored_events
       set venue_address = new.venue_address,
           venue_place_id = new.venue_place_id,
           venue_lat = new.venue_lat,
           venue_lng = new.venue_lng
     where listing_id = new.id
       and venue_lat is null
       and status::text in ('in_progress', 'confirmed');
  end if;
  return new;
end;
$$;
revoke all on function public.event_listings_venue_to_sponsorships() from public, anon, authenticated;

drop trigger if exists event_listings_venue_to_sponsorships on public.event_listings;
create trigger event_listings_venue_to_sponsorships
  after insert or update of venue_lat, venue_lng on public.event_listings
  for each row execute function public.event_listings_venue_to_sponsorships();

-- participations: the check-in fields are written by the definer functions
-- (or an admin). An admin's direct "Mark checked in" is stamped 'admin'.
create or replace function public.participations_checkin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_untrusted_writer() then
    if tg_op = 'INSERT' then
      new.checkin_method := null;
      new.checkin_distance_m := null;
      new.checkin_accuracy_m := null;
      return new;
    end if;
    if new.checkin_method is distinct from old.checkin_method
       or new.checkin_distance_m is distinct from old.checkin_distance_m
       or new.checkin_accuracy_m is distinct from old.checkin_accuracy_m then
      raise exception 'Not allowed to change how this check-in was recorded' using errcode = '42501';
    end if;
    -- The legacy direct artist update (pre-0126 app) — still allowed by
    -- participations_guard for a selected row; record it as the artist's.
    if tg_op = 'UPDATE' and new.status::text = 'attendance_verified'
       and old.status::text is distinct from 'attendance_verified' then
      new.checkin_method := 'artist';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status::text = 'attendance_verified'
     and old.status::text is distinct from 'attendance_verified'
     and new.checkin_method is null and public.is_admin() then
    new.checkin_method := 'admin';
  end if;
  return new;
end;
$$;
revoke all on function public.participations_checkin_fields() from public, anon, authenticated;

drop trigger if exists participations_checkin_fields on public.participations;
create trigger participations_checkin_fields
  before insert or update on public.participations
  for each row execute function public.participations_checkin_fields();

-- -----------------------------------------------------------------------------
-- 5. Location check-in
-- -----------------------------------------------------------------------------
create or replace function public.check_in_at_location(
  p_participation_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_accuracy constant double precision := 1000;  -- keep in step with CHECKIN_MAX_ACCURACY_M
  c_max_per_hour constant int := 20;
  v_uid uuid := auth.uid();
  v_row record;
  v_today date;
  v_distance double precision;
  v_result text;
  v_recent int;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'signed_out');
  end if;

  select count(*) into v_recent
    from public.checkin_attempts
   where profile_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= c_max_per_hour then
    return jsonb_build_object('result', 'rate_limited');
  end if;

  select p.id, p.status::text as status, p.sponsored_event_id,
         se.name, se.event_date, se.status::text as event_status,
         coalesce(se.timezone, 'Europe/London') as tz,
         se.venue_lat, se.venue_lng, se.venue_address, se.checkin_radius_m
    into v_row
    from public.participations p
    join public.sponsored_events se on se.id = p.sponsored_event_id
   where p.id = p_participation_id and p.audience_profile_id = v_uid
     for update of p;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_row.status in ('attendance_verified', 'reward_released') then
    return jsonb_build_object('result', 'already', 'event_name', v_row.name);
  end if;

  if v_row.event_status not in ('confirmed', 'completed') then
    v_result := 'event_not_live';
  elsif v_row.status not in ('registered', 'ticket_uploaded') then
    v_result := 'not_registered';
  else
    if v_row.event_date is not null then
      v_today := (now() at time zone v_row.tz)::date;
      if v_today < v_row.event_date then
        v_result := 'too_early';
      elsif v_today > v_row.event_date then
        v_result := 'too_late';
      end if;
    end if;
    if v_result is null then
      if v_row.venue_lat is null or v_row.venue_lng is null then
        v_result := 'no_venue';
      elsif p_lat is null or p_lng is null
            or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
        v_result := 'invalid_location';
      elsif p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > c_max_accuracy then
        v_result := 'low_accuracy';
      else
        v_distance := public.geo_distance_m(p_lat, p_lng, v_row.venue_lat, v_row.venue_lng);
        v_result := case when v_distance <= v_row.checkin_radius_m then 'verified' else 'too_far' end;
      end if;
    end if;
  end if;

  insert into public.checkin_attempts
    (participation_id, sponsored_event_id, profile_id, result, lat, lng, accuracy_m, distance_m)
  values (
    v_row.id, v_row.sponsored_event_id, v_uid, v_result,
    case when p_lat between -90 and 90 then round(p_lat::numeric, 3)::double precision end,
    case when p_lng between -180 and 180 then round(p_lng::numeric, 3)::double precision end,
    case when p_accuracy_m between 0 and 1000000 then round(p_accuracy_m)::int end,
    round(v_distance)::int);

  if v_result = 'verified' then
    update public.participations
       set status = 'attendance_verified',
           attendance_verified_at = now(),
           checkin_method = 'location',
           checkin_distance_m = round(v_distance)::int,
           checkin_accuracy_m = round(p_accuracy_m)::int
     where id = v_row.id;
  end if;

  return jsonb_build_object(
    'result', v_result,
    'event_name', v_row.name,
    'event_date', v_row.event_date,
    'distance_m', round(v_distance)::int,
    'radius_m', v_row.checkin_radius_m,
    'accuracy_m', case when p_accuracy_m between 0 and 1000000 then round(p_accuracy_m)::int end,
    'max_accuracy_m', c_max_accuracy::int);
end;
$$;
revoke all on function public.check_in_at_location(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.check_in_at_location(uuid, double precision, double precision, double precision) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. QR check-in (0061 → 0123): no longer requires `selected` (retired 7 Nov),
--    and records the method. Otherwise unchanged — event day only.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_attendance(p_token uuid, p_participation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_today date;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'signed_out');
  end if;

  select p.id, p.status::text as status, se.name, se.event_date, se.status::text as event_status,
         se.attendance_qr_token, coalesce(se.timezone, 'Europe/London') as tz
    into v_row
    from public.participations p
    join public.sponsored_events se on se.id = p.sponsored_event_id
   where p.id = p_participation_id and p.audience_profile_id = v_uid
     for update of p;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_row.attendance_qr_token is distinct from p_token then
    return jsonb_build_object('result', 'wrong_event', 'event_name', v_row.name);
  end if;
  if v_row.event_status not in ('confirmed', 'completed') then
    return jsonb_build_object('result', 'event_not_live', 'event_name', v_row.name);
  end if;
  if v_row.status in ('attendance_verified', 'reward_released') then
    return jsonb_build_object('result', 'already', 'event_name', v_row.name);
  end if;
  if v_row.status not in ('registered', 'ticket_uploaded') then
    return jsonb_build_object('result', 'not_registered', 'event_name', v_row.name);
  end if;

  if v_row.event_date is not null then
    v_today := (now() at time zone v_row.tz)::date;
    if v_today < v_row.event_date then
      return jsonb_build_object('result', 'too_early', 'event_name', v_row.name, 'event_date', v_row.event_date);
    end if;
    if v_today > v_row.event_date then
      return jsonb_build_object('result', 'too_late', 'event_name', v_row.name, 'event_date', v_row.event_date);
    end if;
  end if;

  update public.participations
     set status = 'attendance_verified', attendance_verified_at = now(), checkin_method = 'qr'
   where id = v_row.id;

  return jsonb_build_object('result', 'verified', 'event_name', v_row.name);
end;
$$;
revoke all on function public.confirm_attendance(uuid, uuid) from public, anon;
grant execute on function public.confirm_attendance(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. The artist checks someone in by hand (they're at the venue but the app
--    and the QR didn't work for them). From the event's day onwards — the
--    team can still do it any time.
-- -----------------------------------------------------------------------------
create or replace function public.artist_check_in_participant(p_participation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'signed_out');
  end if;

  select p.id, p.status::text as status, p.audience_profile_id,
         se.name, se.event_date, se.status::text as event_status, se.artist_profile_id,
         coalesce(se.timezone, 'Europe/London') as tz
    into v_row
    from public.participations p
    join public.sponsored_events se on se.id = p.sponsored_event_id
   where p.id = p_participation_id
     for update of p;

  if not found or v_row.artist_profile_id is distinct from v_uid then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_row.status in ('attendance_verified', 'reward_released') then
    return jsonb_build_object('result', 'already', 'event_name', v_row.name);
  end if;
  if v_row.event_status not in ('confirmed', 'completed') then
    return jsonb_build_object('result', 'event_not_live', 'event_name', v_row.name);
  end if;
  if v_row.status not in ('registered', 'ticket_uploaded') then
    return jsonb_build_object('result', 'not_registered', 'event_name', v_row.name);
  end if;
  if v_row.event_date is not null and (now() at time zone v_row.tz)::date < v_row.event_date then
    return jsonb_build_object('result', 'too_early', 'event_name', v_row.name, 'event_date', v_row.event_date);
  end if;

  update public.participations
     set status = 'attendance_verified', attendance_verified_at = now(), checkin_method = 'artist'
   where id = v_row.id;

  return jsonb_build_object('result', 'verified', 'event_name', v_row.name,
                            'audience_profile_id', v_row.audience_profile_id);
end;
$$;
revoke all on function public.artist_check_in_participant(uuid) from public, anon;
grant execute on function public.artist_check_in_participant(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Retention: check-in coordinates are cleared after 90 days (the result,
--    accuracy and distance stay). Called daily by /api/cron/code-deadlines.
-- -----------------------------------------------------------------------------
create or replace function public.purge_checkin_locations()
returns integer
language sql
security definer
set search_path = public
as $$
  with cleared as (
    update public.checkin_attempts
       set lat = null, lng = null
     where lat is not null and created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::int from cleared;
$$;
revoke all on function public.purge_checkin_locations() from public, anon, authenticated;
grant execute on function public.purge_checkin_locations() to service_role;
