-- =============================================================================
-- 0123 — Check-in is only open on the day of the event (client, 17 Nov: "event
-- check-in only active on the day of the event; this needs to be on the
-- audience's event notes").
--
-- confirm_attendance() (0061) accepted a check-in from the day before to the
-- day after the event. It now accepts it on the event's own calendar day only,
-- in the event's timezone. Nothing else about it changes (token must match the
-- event, the person must be registered, the event confirmed). The audience
-- pages say so, and the "too early" / "too late" refusals already name the
-- event date.
--
-- Re-runnable (create or replace).
-- =============================================================================

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

  select p.id, p.status, p.selected, se.name, se.event_date, se.status as event_status,
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
  if not v_row.selected or v_row.status not in ('registered', 'ticket_uploaded') then
    return jsonb_build_object('result', 'not_selected', 'event_name', v_row.name);
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
     set status = 'attendance_verified', attendance_verified_at = now()
   where id = v_row.id;

  return jsonb_build_object('result', 'verified', 'event_name', v_row.name);
end;
$$;
