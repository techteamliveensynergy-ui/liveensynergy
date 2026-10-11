-- =============================================================================
-- 0061 — Security: column guards on profiles, participations, sponsored_events
--
-- Found during the 10 Oct audit and confirmed against production
-- (docs/standup-2026-10-09-plan.md §1, docs/testing/core-flow-test-scenarios
-- SEC-01..06). RLS decides which ROWS a user may touch; nothing decided which
-- COLUMNS, so with their own session and the public anon key:
--
--   * any user could set profiles.role = 'admin' (and sign-up metadata could
--     carry role 'admin' straight into handle_new_user);
--   * a blocked user could set their own is_active back to true;
--   * an audience member could mark themselves selected / checked in;
--   * a brand or artist could rewrite any participation of their event, and
--     rewrite (or delete) the sponsorship itself — budget, status, agreement;
--   * close_campaign_on_acceptance() (0021, unused) was executable by anyone,
--     including signed-out callers.
--
-- The fix is the same technique 0054 used for order forms: the database is the
-- rule, the app's checks are the courtesy. Each guard is a BEFORE trigger that
-- only bites on DIRECT client writes — `current_user` is 'authenticated' or
-- 'anon' — and never for admins. Security-definer functions (agree_to_
-- sponsorship, confirm_reward_codes, the new confirm_attendance, …) run as
-- their owner and the service role runs as service_role, so both pass through
-- untouched.
--
-- Additive: no data changes, no columns dropped, every existing app write path
-- keeps working (each one is listed next to the rule that allows it).
-- =============================================================================

-- Direct client write by someone who isn't an admin?
create or replace function public.is_untrusted_writer()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_user in ('authenticated', 'anon') and not public.is_admin();
$$;

-- -----------------------------------------------------------------------------
-- 1. profiles
-- -----------------------------------------------------------------------------
-- Users keep: full_name (settings), onboarding_completed (onboarding),
-- last_seen_at (touch_last_seen is definer anyway). Everything that decides
-- what an account may do is admin-only.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_untrusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- handle_new_user (definer) creates the row; a direct insert can only ever
    -- create an ordinary, active account for yourself.
    if new.role = 'admin' or coalesce(new.is_active, true) = false
       or new.suspended_until is not null or new.blocked_at is not null
       or new.plan_id is not null then
      raise exception 'Not allowed to set account status fields' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.blocked_at is distinct from old.blocked_at
     or new.blocked_reason is distinct from old.blocked_reason
     or new.suspended_until is distinct from old.suspended_until
     or new.plan_id is distinct from old.plan_id
     or new.email is distinct from old.email
     or new.terms_accepted_at is distinct from old.terms_accepted_at
     or new.terms_version is distinct from old.terms_version
     or new.id is distinct from old.id then
    raise exception 'Only an admin can change account role, status, plan, email or terms' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- Sign-up metadata is client-supplied: only the self-serve roles may come
-- through it. Anything else (including 'admin' or a typo) becomes audience.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (
    id, role, full_name, email, terms_accepted_at, terms_version
  )
  values (
    new.id,
    case when v_role in ('brand', 'artist', 'event', 'audience')
         then v_role::user_role else 'audience'::user_role end,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    new.raw_user_meta_data ->> 'terms_version'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- An automatic (no-show) suspension lifts itself once it has run its course.
-- The middleware used to do this with a direct update, which the guard above
-- now refuses — and which also let anyone lift any block. This only ever lifts
-- the caller's own suspension, and only once suspended_until has passed;
-- a manual admin block (suspended_until null) is untouched.
create or replace function public.lift_expired_suspension()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.profiles
     set is_active = true, blocked_at = null, blocked_reason = null, suspended_until = null
   where id = auth.uid()
     and is_active = false
     and suspended_until is not null
     and suspended_until <= now();

  select is_active into v_active from public.profiles where id = auth.uid();
  return coalesce(v_active, false);
end;
$$;

revoke all on function public.lift_expired_suspension() from public, anon;
grant execute on function public.lift_expired_suspension() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. participations
-- -----------------------------------------------------------------------------
create or replace function public.participations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event record;
  v_is_artist boolean;
begin
  if not public.is_untrusted_writer() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    -- Audience may withdraw only before the draw picked them.
    if old.audience_profile_id = v_uid and old.selected = false and old.status = 'registered' then
      return old;
    end if;
    raise exception 'This registration can no longer be withdrawn' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- confirmRegistration, registerPendingEvent, registerForEventAfterSurvey.
    if new.audience_profile_id is distinct from v_uid then
      raise exception 'You can only register yourself' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles where id = v_uid and role = 'audience') then
      raise exception 'Only audience accounts can register for events' using errcode = '42501';
    end if;
    if new.status <> 'registered' or coalesce(new.selected, false)
       or new.selected_at is not null or new.attendance_verified_at is not null
       or new.reward_amount_gbp is not null or new.reward_released_at is not null
       or coalesce(new.no_show, false) or new.ticket_proof_url is not null then
      raise exception 'A new registration starts as registered' using errcode = '42501';
    end if;

    select status, participation_deadline, event_date, coalesce(timezone, 'Europe/London') as tz
      into v_event
      from public.sponsored_events where id = new.sponsored_event_id;
    if not found or v_event.status <> 'confirmed' then
      raise exception 'Registration for this event is closed' using errcode = 'P0001';
    end if;
    if v_event.participation_deadline is not null and v_event.participation_deadline < now() then
      raise exception 'The registration deadline has passed' using errcode = 'P0001';
    end if;
    if v_event.event_date is not null and v_event.event_date < (now() at time zone v_event.tz)::date then
      raise exception 'This event has already taken place' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE ----------------------------------------------------------------
  -- Fields nobody but an admin (or a definer function) may touch.
  if new.id is distinct from old.id
     or new.sponsored_event_id is distinct from old.sponsored_event_id
     or new.audience_profile_id is distinct from old.audience_profile_id
     or new.selected is distinct from old.selected
     or new.selected_at is distinct from old.selected_at
     or new.reward_amount_gbp is distinct from old.reward_amount_gbp
     or new.reward_released_at is distinct from old.reward_released_at
     or new.no_show is distinct from old.no_show
     or new.no_show_marked_at is distinct from old.no_show_marked_at
     or new.terms_accepted_at is distinct from old.terms_accepted_at then
    raise exception 'Not allowed to change selection, rewards or no-show' using errcode = '42501';
  end if;

  if old.audience_profile_id = v_uid then
    -- The participant: consent toggles (updateParticipationPrefs) and ticket
    -- proof (uploadTicketProof) — the latter only once selected, and never
    -- moving a checked-in or rewarded row backwards. Check-in itself goes
    -- through confirm_attendance().
    if new.attendance_verified_at is distinct from old.attendance_verified_at then
      raise exception 'Check in by scanning the event QR code' using errcode = '42501';
    end if;
    if new.status is distinct from old.status or new.ticket_proof_url is distinct from old.ticket_proof_url then
      if not (old.selected
              and old.status in ('registered', 'ticket_uploaded')
              and new.status = 'ticket_uploaded') then
        raise exception 'Ticket proof can only be added once you are selected, before check-in' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- An event party. Only the artist/organiser may act, and only to verify the
  -- attendance of someone the draw selected (updateParticipation 'verify').
  -- The brand has no write here (9 Oct brief: check-in is artist + audience).
  select (se.artist_profile_id = v_uid) into v_is_artist
    from public.sponsored_events se where se.id = old.sponsored_event_id;
  if coalesce(v_is_artist, false)
     and old.selected
     and old.status in ('registered', 'ticket_uploaded')
     and new.status = 'attendance_verified'
     and new.ticket_proof_url is not distinct from old.ticket_proof_url
     and new.newsletter_opt_in is not distinct from old.newsletter_opt_in
     and new.bank_details_provided is not distinct from old.bank_details_provided then
    return new;
  end if;

  raise exception 'Not allowed to change this registration' using errcode = '42501';
end;
$$;

create or replace trigger participations_guard
  before insert or update or delete on public.participations
  for each row execute function public.participations_guard();

-- Self check-in from the event QR. The old action verified whatever
-- participation id the form posted, never comparing the scanned token with
-- the event or looking at the date — so check-in worked from home, for any
-- event. Window: from the day before to the day after the event, in the
-- event's own time zone (generous for late finishes and early doors; tighten
-- once the client agrees a rule — test-scenarios appendix #11).
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
    if v_today < v_row.event_date - 1 then
      return jsonb_build_object('result', 'too_early', 'event_name', v_row.name, 'event_date', v_row.event_date);
    end if;
    if v_today > v_row.event_date + 1 then
      return jsonb_build_object('result', 'too_late', 'event_name', v_row.name, 'event_date', v_row.event_date);
    end if;
  end if;

  update public.participations
     set status = 'attendance_verified', attendance_verified_at = now()
   where id = v_row.id;

  return jsonb_build_object('result', 'verified', 'event_name', v_row.name);
end;
$$;

revoke all on function public.confirm_attendance(uuid, uuid) from public, anon;
grant execute on function public.confirm_attendance(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. sponsored_events
-- -----------------------------------------------------------------------------
-- Ownership check for the guard below. Definer, because an artist proposing
-- against an open campaign can't read the campaigns table under RLS — an
-- invoker check would refuse their legitimate proposal.
create or replace function public.campaign_belongs_to_brand(p_campaign uuid, p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.campaigns c where c.id = p_campaign and c.brand_id = p_brand);
$$;
revoke all on function public.campaign_belongs_to_brand(uuid, uuid) from public, anon;
grant execute on function public.campaign_belongs_to_brand(uuid, uuid) to authenticated;

-- "sponsored_events: parties or admin" is FOR ALL (0002) — a party could
-- rewrite budget, status or agreement flags, or delete the row (which cascades
-- to every participation). Agreement goes through agree_to_sponsorship(), code
-- consent through confirm_reward_codes(), both definer.
create or replace function public.sponsored_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_brand boolean;
  v_today date;
begin
  if not public.is_untrusted_writer() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Only an admin can delete a sponsorship' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- createSponsoredEvent (legacy self-serve proposal). The caller's own
    -- agreement may be pre-set, never the other side's; and a brand may only
    -- attach its own campaign.
    select exists (select 1 from public.brands b where b.id = new.brand_id and b.profile_id = v_uid)
      into v_is_brand;
    if new.status <> 'in_progress'
       or new.reward_codes_confirmed_at is not null or new.reward_codes_confirmed_by is not null
       or new.artist_upfront_paid_at is not null or new.artist_remainder_released_at is not null
       or new.artist_remainder_released_by is not null then
      raise exception 'A new proposal starts in progress' using errcode = '42501';
    end if;
    if v_is_brand and new.artist_agreed then
      raise exception 'You can only record your own agreement' using errcode = '42501';
    end if;
    if not v_is_brand and new.brand_agreed then
      raise exception 'You can only record your own agreement' using errcode = '42501';
    end if;
    if new.campaign_id is not null
       and not public.campaign_belongs_to_brand(new.campaign_id, new.brand_id) then
      raise exception 'That campaign does not belong to this brand' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE ----------------------------------------------------------------
  if new.id is distinct from old.id
     or new.reference is distinct from old.reference
     or new.brand_id is distinct from old.brand_id
     or new.campaign_id is distinct from old.campaign_id
     or new.listing_id is distinct from old.listing_id
     or new.artist_profile_id is distinct from old.artist_profile_id
     or new.name is distinct from old.name
     or new.event_date is distinct from old.event_date
     or new.start_time is distinct from old.start_time
     or new.timezone is distinct from old.timezone
     or new.venue_details is distinct from old.venue_details
     or new.location is distinct from old.location
     or new.budget_gbp is distinct from old.budget_gbp
     or new.remaining_budget_gbp is distinct from old.remaining_budget_gbp
     or new.brand_agreed is distinct from old.brand_agreed
     or new.artist_agreed is distinct from old.artist_agreed
     or new.attendance_qr_token is distinct from old.attendance_qr_token
     or new.reward_codes_confirmed_at is distinct from old.reward_codes_confirmed_at
     or new.reward_codes_confirmed_by is distinct from old.reward_codes_confirmed_by
     or new.artist_fee_gbp is distinct from old.artist_fee_gbp
     or new.artist_upfront_gbp is distinct from old.artist_upfront_gbp
     or new.artist_upfront_paid_at is distinct from old.artist_upfront_paid_at
     or new.artist_remainder_gbp is distinct from old.artist_remainder_gbp
     or new.artist_remainder_released_at is distinct from old.artist_remainder_released_at
     or new.artist_remainder_released_by is distinct from old.artist_remainder_released_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only an admin can change these sponsorship details' using errcode = '42501';
  end if;

  -- Status: a party may only mark a confirmed event completed, and only once
  -- its date has arrived (markCompleted). Everything else is the agreement
  -- function's or an admin's.
  if new.status is distinct from old.status then
    v_today := (now() at time zone coalesce(old.timezone, 'Europe/London'))::date;
    if not (old.status = 'confirmed' and new.status = 'completed'
            and (old.event_date is null or old.event_date <= v_today)) then
      raise exception 'A sponsorship can only be marked completed once confirmed and the event date has arrived' using errcode = '42501';
    end if;
  end if;

  -- Terms can be edited only while the deal is still being agreed
  -- (updateSponsoredEvent). Changing them withdraws both agreements, so nobody
  -- confirms terms the other side never saw (test MAT-10).
  if new.terms is distinct from old.terms
     or new.reward_rules is distinct from old.reward_rules
     or new.branding_guidelines is distinct from old.branding_guidelines
     or new.attendance_method is distinct from old.attendance_method
     or new.participation_deadline is distinct from old.participation_deadline then
    if old.status <> 'in_progress' then
      raise exception 'Terms are locked once the sponsorship is confirmed — ask the team to change them' using errcode = '42501';
    end if;
    new.brand_agreed := false;
    new.artist_agreed := false;
  end if;

  return new;
end;
$$;

create or replace trigger sponsored_events_guard
  before insert or update or delete on public.sponsored_events
  for each row execute function public.sponsored_events_guard();

-- -----------------------------------------------------------------------------
-- 4. Legacy RPC: close_campaign_on_acceptance (0021) — unused since
--    agree_to_sponsorship() replaced it, but still executable by anon and
--    authenticated, and it never checked the event belonged to the campaign.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'close_campaign_on_acceptance'
             and pronamespace = 'public'::regnamespace) then
    execute (
      select string_agg(format('revoke all on function %s from public, anon, authenticated', oid::regprocedure), '; ')
        from pg_proc
       where proname = 'close_campaign_on_acceptance' and pronamespace = 'public'::regnamespace
    );
  end if;
end $$;
