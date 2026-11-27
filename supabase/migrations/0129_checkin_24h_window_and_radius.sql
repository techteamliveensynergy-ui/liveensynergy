-- =============================================================================
-- 0129 — Check-in rules from the 27 Nov testing notes, on top of 0126's
-- location check-in:
--
--   (1) The window: check-in opens 24 HOURS BEFORE the event starts (00:00 on
--       its day when no start time is set) and closes at the end of the event's
--       own day, in the event's timezone — it was the event day only (0123/0126).
--       Re-declared for both ways in: check_in_at_location() (app, with
--       location) and confirm_attendance() (QR). The artist's manual check-in
--       (artist_check_in_participant) is unchanged.
--   (2) The default radius becomes 0.3 MILE (483 m), was 2 miles (3,219 m):
--       the column default changes, and sponsored events still on the old
--       default are moved to the new one. An event the team set to any other
--       value keeps it. The team can still widen it per event.
--
-- Needs 0126_location_checkin.sql. Re-runnable.
-- =============================================================================

alter table public.sponsored_events alter column checkin_radius_m set default 483;
update public.sponsored_events set checkin_radius_m = 483 where checkin_radius_m = 3219;

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
  v_now timestamp;
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
         se.name, se.event_date, se.start_time, se.status::text as event_status,
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
    -- Window: from 24 hours before the start (00:00 when no time is set) to the
    -- end of the event's own day, in the event's timezone (client, 27 Nov).
    if v_row.event_date is not null then
      v_now := now() at time zone v_row.tz;
      if v_now < (v_row.event_date + coalesce(v_row.start_time, time '00:00')) - interval '24 hours' then
        v_result := 'too_early';
      elsif v_now >= (v_row.event_date + 1)::timestamp then
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

create or replace function public.confirm_attendance(p_token uuid, p_participation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_now timestamp;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'signed_out');
  end if;

  select p.id, p.status::text as status, se.name, se.event_date, se.start_time, se.status::text as event_status,
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

  -- Window: from 24 hours before the start (00:00 when no time is set) to the end
  -- of the event's own day, in the event's timezone (client, 27 Nov).
  if v_row.event_date is not null then
    v_now := now() at time zone v_row.tz;
    if v_now < (v_row.event_date + coalesce(v_row.start_time, time '00:00')) - interval '24 hours' then
      return jsonb_build_object('result', 'too_early', 'event_name', v_row.name, 'event_date', v_row.event_date);
    end if;
    if v_now >= (v_row.event_date + 1)::timestamp then
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
