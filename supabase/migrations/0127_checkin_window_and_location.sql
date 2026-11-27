-- =============================================================================
-- 0127 — Check-in opens 24 hours before the event and needs the person to be
-- at the venue (client, 27 Nov: "check-in will be available 24 hours prior to
-- the event and you will be able to check-in when within 0.25 / 0.3 mile radius";
-- "audience check-in to state in-app check-in — where do they do it?").
--
-- 1. sponsored_events gets the venue's coordinates (venue_lat / venue_lng) and a
--    check-in radius (checkin_radius_m, default 483 m = 0.3 mile). The team sets
--    the coordinates; an artist or brand can't (a guard trigger refuses).
-- 2. confirm_attendance() is re-declared with two optional location arguments
--    and a new window: from 24 hours before the event starts (00:00 if no time
--    is set) to the end of the event's own day, in the event's timezone.
--    - With the QR token (the scan at the venue): token must match the event.
--      If the venue has coordinates the person must also share a location
--      within the radius; if it has none, the QR scan alone is enough.
--    - Without a token (the in-app "Check in" button): the venue MUST have
--      coordinates and the location MUST be within the radius — nothing else
--      proves the person is there. Otherwise 'in_app_unavailable'.
--    A reported accuracy up to 150 m is allowed on top of the radius so a weak
--    GPS fix indoors doesn't lock out someone standing at the door.
--    New results: location_needed, too_far, in_app_unavailable.
-- Re-runnable.
-- =============================================================================

alter table public.sponsored_events
  add column if not exists venue_lat        double precision,
  add column if not exists venue_lng        double precision,
  add column if not exists checkin_radius_m integer not null default 483;

alter table public.sponsored_events drop constraint if exists sponsored_events_venue_coords_check;
alter table public.sponsored_events
  add constraint sponsored_events_venue_coords_check check (
    (venue_lat is null and venue_lng is null)
    or (venue_lat between -90 and 90 and venue_lng between -180 and 180)
  );
alter table public.sponsored_events drop constraint if exists sponsored_events_checkin_radius_check;
alter table public.sponsored_events
  add constraint sponsored_events_checkin_radius_check check (checkin_radius_m between 50 and 5000);

-- Only the team (or a definer/service caller) may set the venue point.
create or replace function public.sponsored_events_geofence_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_untrusted_writer() then
    if tg_op = 'INSERT' then
      if new.venue_lat is not null or new.venue_lng is not null or new.checkin_radius_m <> 483 then
        raise exception 'Only the team can set the venue location' using errcode = '42501';
      end if;
    elsif new.venue_lat is distinct from old.venue_lat
       or new.venue_lng is distinct from old.venue_lng
       or new.checkin_radius_m is distinct from old.checkin_radius_m then
      raise exception 'Only the team can set the venue location' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sponsored_events_geofence_guard on public.sponsored_events;
create trigger sponsored_events_geofence_guard
  before insert or update on public.sponsored_events
  for each row execute function public.sponsored_events_geofence_guard();

-- Great-circle distance in metres.
create or replace function public.distance_metres(lat1 double precision, lng1 double precision,
                                                  lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

drop function if exists public.confirm_attendance(uuid, uuid);

create or replace function public.confirm_attendance(
  p_token uuid,
  p_participation_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_now timestamp;
  v_opens timestamp;
  v_closes timestamp;
  v_dist double precision;
  v_slack double precision;
  v_has_point boolean;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'signed_out');
  end if;

  select p.id, p.status, p.selected, se.name, se.event_date, se.start_time,
         se.status as event_status, se.attendance_qr_token,
         se.venue_lat, se.venue_lng, se.checkin_radius_m,
         coalesce(se.timezone, 'Europe/London') as tz
    into v_row
    from public.participations p
    join public.sponsored_events se on se.id = p.sponsored_event_id
   where p.id = p_participation_id and p.audience_profile_id = v_uid
     for update of p;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  -- A scan must carry this event's own token; the in-app button carries none.
  if p_token is not null and v_row.attendance_qr_token is distinct from p_token then
    return jsonb_build_object('result', 'wrong_event', 'event_name', v_row.name);
  end if;
  if v_row.event_status not in ('confirmed', 'completed') then
    return jsonb_build_object('result', 'event_not_live', 'event_name', v_row.name);
  end if;
  if v_row.status in ('attendance_verified', 'reward_released') then
    return jsonb_build_object('result', 'already', 'event_name', v_row.name);
  end if;
  if not v_row.selected or v_row.status not in ('registered', 'ticket_uploaded') then
    return jsonb_build_object('result', 'not_selected', 'event_name', v_row.name);
  end if;

  -- Window: 24 h before the start (00:00 when no time is set) to the end of the event day.
  if v_row.event_date is not null then
    v_now    := now() at time zone v_row.tz;
    v_opens  := (v_row.event_date + coalesce(v_row.start_time, time '00:00')) - interval '24 hours';
    v_closes := (v_row.event_date + 1)::timestamp;
    if v_now < v_opens then
      return jsonb_build_object('result', 'too_early', 'event_name', v_row.name, 'event_date', v_row.event_date);
    end if;
    if v_now >= v_closes then
      return jsonb_build_object('result', 'too_late', 'event_name', v_row.name, 'event_date', v_row.event_date);
    end if;
  end if;

  -- Location.
  v_has_point := v_row.venue_lat is not null and v_row.venue_lng is not null;
  if p_token is null and not v_has_point then
    return jsonb_build_object('result', 'in_app_unavailable', 'event_name', v_row.name);
  end if;
  if v_has_point then
    if p_lat is null or p_lng is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      return jsonb_build_object('result', 'location_needed', 'event_name', v_row.name);
    end if;
    v_slack := least(greatest(coalesce(p_accuracy, 0), 0), 150);
    v_dist  := public.distance_metres(p_lat, p_lng, v_row.venue_lat, v_row.venue_lng);
    if v_dist > v_row.checkin_radius_m + v_slack then
      return jsonb_build_object('result', 'too_far', 'event_name', v_row.name,
                                'distance_m', round(v_dist), 'radius_m', v_row.checkin_radius_m);
    end if;
  end if;

  update public.participations
     set status = 'attendance_verified', attendance_verified_at = now()
   where id = v_row.id;

  return jsonb_build_object('result', 'verified', 'event_name', v_row.name);
end;
$$;

revoke all on function public.confirm_attendance(uuid, uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.confirm_attendance(uuid, uuid, double precision, double precision, double precision) to authenticated;
