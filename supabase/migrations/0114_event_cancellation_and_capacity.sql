-- =============================================================================
-- 0114 — Event safety: no silent deletes, admin-run cancellation, surveys that
-- close, a "codes ran out" alarm, and a registration cap with a waitlist.
--
-- QA 8 Nov ("biggest risk"): an artist could delete their listing at any stage,
-- even with a paid brand and live codes — no warning, no approval, nobody told,
-- and the public page lost its venue/image/ticket link (the deal's listing_id is
-- `on delete set null`). A direct survey link also kept accepting answers after
-- the event, after the deadline and after the campaign had ended.
--
--   1. Listings with partnership history can't be deleted (archive instead);
--      one with a live partnership can't be unpublished or archived either.
--   2. Parties ask the team to cancel (request_event_cancellation); only an
--      admin cancels (admin_cancel_sponsored_event): registrations, surveys and
--      code issuing stop, brand/artist/audience/waitlist are told, it is
--      audited, and the paid invoices come back so the admin can refund.
--      Cancelling frees the campaign (the deal becomes `withdrawn`), so the team
--      can match the brand with another artist.
--   3. survey_responses_require_open (0070) also refuses: a campaign that is
--      closed/completed, a cancelled event, a pre-event survey once the event
--      day is over, a pre-event survey from someone not registered once the
--      registration deadline has passed or the event is full (cap + waitlist).
--      A post-event survey stays open until the campaign is completed/closed
--      (client decision, 8 Nov).
--   4. reward_code_outages: when an event that has been issuing codes can no
--      longer issue any, the admins and the artist are told once; the brand is
--      told by the daily cron if it is still empty 48 hours later. Adding codes
--      (or raising a cap) closes the outage.
--   5. sponsored_events.registration_cap (admin-set) + event_waitlist: once the
--      cap is reached, the next 10% (at least one) join a waitlist (client,
--      8 Nov: "cap + 10% more waitlist for surveys"); they can still answer the
--      survey. A place that frees up — a withdrawal, a rejection, a raised cap —
--      goes to the longest-waiting person automatically, and their code issues
--      then if their response passed.
--
-- Everything here is additive and re-runnable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Columns
-- ---------------------------------------------------------------------------
alter table public.event_listings
  add column if not exists archived_at timestamptz;

alter table public.sponsored_events
  add column if not exists cancelled_at     timestamptz,
  add column if not exists cancelled_by     uuid references public.profiles (id) on delete set null,
  add column if not exists cancel_reason    text,
  add column if not exists registration_cap integer;

do $$ begin
  alter table public.sponsored_events
    add constraint sponsored_events_registration_cap_positive
    check (registration_cap is null or registration_cap > 0);
exception when duplicate_object then null; end $$;

-- The new sponsored_events columns are the team's to set. The 0061 guard lists
-- the columns it knows about; this one covers the new ones the same way.
create or replace function public.sponsored_events_cancel_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_untrusted_writer() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.cancelled_at is not null or new.cancelled_by is not null
       or new.cancel_reason is not null or new.registration_cap is not null then
      raise exception 'Only the Live·En·Synergy team can set this' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancel_reason is distinct from old.cancel_reason
     or new.registration_cap is distinct from old.registration_cap then
    raise exception 'Only the Live·En·Synergy team can change this' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists sponsored_events_cancel_guard on public.sponsored_events;
create trigger sponsored_events_cancel_guard
  before insert or update on public.sponsored_events
  for each row execute function public.sponsored_events_cancel_guard();

-- ---------------------------------------------------------------------------
-- 1. Listings: no delete with history, no unpublish/archive with a live deal
-- ---------------------------------------------------------------------------
-- 'live' (a proposal or confirmed deal), 'history' (only finished, withdrawn or
-- cancelled ones) or 'none'. Answers only for the listing's owner or an admin.
create or replace function public.listing_deal_state(p_listing uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.event_listings l
       where l.id = p_listing and (l.owner_profile_id = auth.uid() or public.is_admin())
    ) and auth.uid() is not null then null
    when exists (select 1 from public.sponsored_events se
                  where se.listing_id = p_listing and se.status in ('in_progress', 'confirmed')) then 'live'
    when exists (select 1 from public.sponsored_events se where se.listing_id = p_listing) then 'history'
    else 'none'
  end
$$;
revoke all on function public.listing_deal_state(uuid) from public, anon;
grant execute on function public.listing_deal_state(uuid) to authenticated, service_role;

create or replace function public.event_listings_deal_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_state text;
begin
  if not public.is_untrusted_writer() then
    return coalesce(new, old);
  end if;
  v_state := public.listing_deal_state(old.id);

  if tg_op = 'DELETE' then
    if v_state = 'live' then
      raise exception 'LISTING_IN_USE: this event is part of an active partnership. Ask the team to cancel it instead.'
        using errcode = 'P0001';
    end if;
    if v_state = 'history' then
      raise exception 'LISTING_HAS_HISTORY: this event has partnership history, so it can be archived but not deleted.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if v_state = 'live' and (
       (new.status is distinct from old.status and new.status in ('draft', 'closed'))
       or (old.archived_at is null and new.archived_at is not null)) then
    raise exception 'LISTING_IN_USE: this event is part of an active partnership. Ask the team to cancel it instead.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists event_listings_deal_guard on public.event_listings;
create trigger event_listings_deal_guard
  before update or delete on public.event_listings
  for each row execute function public.event_listings_deal_guard();

-- ---------------------------------------------------------------------------
-- 2. Cancellation requests (parties) and cancellation (admins)
-- ---------------------------------------------------------------------------
create table if not exists public.sponsored_event_cancellation_requests (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references public.sponsored_events (id) on delete cascade,
  requested_by       uuid references public.profiles (id) on delete set null,
  requester_role     text check (requester_role in ('brand', 'artist')),
  reason             text not null check (char_length(btrim(reason)) between 10 and 2000),
  status             text not null default 'pending'
                       check (status in ('pending', 'declined', 'accepted')),
  admin_note         text,
  decided_by         uuid references public.profiles (id) on delete set null,
  decided_at         timestamptz,
  created_at         timestamptz not null default now()
);
create unique index if not exists sponsored_event_cancellation_one_pending
  on public.sponsored_event_cancellation_requests (sponsored_event_id) where status = 'pending';

alter table public.sponsored_event_cancellation_requests enable row level security;
drop policy if exists "cancellation requests: admin" on public.sponsored_event_cancellation_requests;
create policy "cancellation requests: admin" on public.sponsored_event_cancellation_requests
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "cancellation requests: parties read" on public.sponsored_event_cancellation_requests;
create policy "cancellation requests: parties read" on public.sponsored_event_cancellation_requests
  for select using (public.is_sponsored_event_party(sponsored_event_id));
-- No party insert/update policy: requests go through request_event_cancellation().
grant select on public.sponsored_event_cancellation_requests to authenticated;
grant all on public.sponsored_event_cancellation_requests to service_role;

create or replace function public.request_event_cancellation(p_event_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_ev    record;
  v_role  text;
  v_id    uuid;
  v_name  text;
  v_admin record;
begin
  if v_uid is null or not public.is_sponsored_event_party(p_event_id) then
    raise exception 'You can only ask to cancel your own partnership.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Please tell the team why (at least a sentence).' using errcode = 'P0001';
  end if;

  select * into v_ev from public.sponsored_events where id = p_event_id for update;
  if v_ev.status not in ('in_progress', 'confirmed') then
    raise exception 'This partnership is no longer active.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sponsored_event_cancellation_requests
              where sponsored_event_id = p_event_id and status = 'pending') then
    raise exception 'A cancellation request is already with the team.' using errcode = 'P0001';
  end if;

  v_role := case when v_ev.artist_profile_id = v_uid then 'artist' else 'brand' end;
  insert into public.sponsored_event_cancellation_requests
    (sponsored_event_id, requested_by, requester_role, reason)
  values (p_event_id, v_uid, v_role, btrim(p_reason))
  returning id into v_id;

  select coalesce(full_name, email, 'A ' || v_role) into v_name from public.profiles where id = v_uid;
  for v_admin in select id from public.profiles where role = 'admin' and is_active loop
    perform public.notify_from_db(
      'admin.cancellation_requested', v_admin.id,
      jsonb_build_object(
        'event_name', v_ev.name,
        'reference', coalesce(v_ev.reference, ''),
        'requester', v_name || ' (' || v_role || ')',
        'reason', btrim(p_reason)),
      '/dashboard/admin/events/sponsored/' || p_event_id || '#cancellation');
  end loop;
  return v_id;
end;
$$;
revoke all on function public.request_event_cancellation(uuid, text) from public, anon;
grant execute on function public.request_event_cancellation(uuid, text) to authenticated;

create or replace function public.admin_decline_cancellation_request(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_ev  record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can decide cancellation requests.' using errcode = '42501';
  end if;
  update public.sponsored_event_cancellation_requests
     set status = 'declined', admin_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = p_request_id and status = 'pending'
  returning * into v_req;
  if not found then
    raise exception 'That request has already been decided.' using errcode = 'P0001';
  end if;
  select name, reference into v_ev from public.sponsored_events where id = v_req.sponsored_event_id;
  if v_req.requested_by is not null then
    perform public.notify_from_db(
      'sponsorship.cancellation_declined', v_req.requested_by,
      jsonb_build_object(
        'event_name', v_ev.name,
        'reference', coalesce(v_ev.reference, ''),
        'note', coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'The team will be in touch about next steps.')),
      '/dashboard/sponsored/' || v_req.sponsored_event_id);
  end if;
  perform public.log_admin_action('sponsored_event.cancellation_declined', 'sponsored_event',
    v_req.sponsored_event_id::text, jsonb_build_object('request_id', p_request_id, 'note', p_note));
end;
$$;
revoke all on function public.admin_decline_cancellation_request(uuid, text) from public, anon;
grant execute on function public.admin_decline_cancellation_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Waitlist (needed by the cancellation below)
-- ---------------------------------------------------------------------------
create table if not exists public.event_waitlist (
  id                        uuid primary key default gen_random_uuid(),
  sponsored_event_id        uuid not null references public.sponsored_events (id) on delete cascade,
  profile_id                uuid not null references public.profiles (id) on delete cascade,
  terms_accepted_at         timestamptz not null default now(),
  newsletter_opt_in         boolean not null default false,
  created_at                timestamptz not null default now(),
  promoted_at               timestamptz,
  promoted_participation_id uuid references public.participations (id) on delete set null,
  left_at                   timestamptz,
  cancelled_at              timestamptz,
  unique (sponsored_event_id, profile_id)
);
create index if not exists event_waitlist_queue
  on public.event_waitlist (sponsored_event_id, created_at)
  where promoted_at is null and left_at is null and cancelled_at is null;

alter table public.event_waitlist enable row level security;
drop policy if exists "event_waitlist: own read" on public.event_waitlist;
create policy "event_waitlist: own read" on public.event_waitlist
  for select using (profile_id = auth.uid());
drop policy if exists "event_waitlist: admin" on public.event_waitlist;
create policy "event_waitlist: admin" on public.event_waitlist
  for all using (public.is_admin()) with check (public.is_admin());
-- Joining, leaving and promotion all go through the functions below.
grant select on public.event_waitlist to authenticated;
grant all on public.event_waitlist to service_role;

-- The waitlist is 10% of the cap, at least one place. Kept in one spot;
-- waitlistSize() in src/lib/event-safety.ts mirrors it for the UI.
create or replace function public.event_waitlist_size(p_cap integer)
returns integer
language sql
immutable
as $$
  select case when p_cap is null then 0 else greatest(1, ceil(p_cap * 0.10)::integer) end
$$;

create or replace function public.event_registered_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.participations
   where sponsored_event_id = p_event_id and status <> 'rejected'
$$;
revoke all on function public.event_registered_count(uuid) from public, anon, authenticated;

create or replace function public.event_waitlist_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.event_waitlist
   where sponsored_event_id = p_event_id
     and promoted_at is null and left_at is null and cancelled_at is null
$$;
revoke all on function public.event_waitlist_count(uuid) from public, anon, authenticated;

-- For pages: how full is this event, and where am I? Never names anyone.
create or replace function public.event_capacity(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cap', se.registration_cap,
    'registered', public.event_registered_count(se.id),
    'waitlist_size', public.event_waitlist_size(se.registration_cap),
    'waitlisted', public.event_waitlist_count(se.id),
    'is_full', se.registration_cap is not null
               and public.event_registered_count(se.id) >= se.registration_cap,
    'waitlist_full', se.registration_cap is not null
               and public.event_waitlist_count(se.id) >= public.event_waitlist_size(se.registration_cap),
    'my_position', (
      select q.pos from (
        select w.profile_id, row_number() over (order by w.created_at) as pos
          from public.event_waitlist w
         where w.sponsored_event_id = se.id
           and w.promoted_at is null and w.left_at is null and w.cancelled_at is null
      ) q where q.profile_id = auth.uid()))
  from public.sponsored_events se
  where se.id = p_event_id
$$;
revoke all on function public.event_capacity(uuid) from public, anon;
grant execute on function public.event_capacity(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Cancelling (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_cancel_sponsored_event(
  p_event_id uuid,
  p_reason   text,
  p_note     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev        record;
  v_reason    text := btrim(coalesce(p_reason, ''));
  v_brand     uuid;
  v_party     uuid;
  v_part      record;
  v_wait      record;
  v_people    integer := 0;
  v_holders   integer := 0;
  v_waiting   integer := 0;
  v_unused    integer := 0;
  v_invoices  jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel a partnership.' using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'Give a reason (at least a sentence) — the brand, artist and audience see it.'
      using errcode = 'P0001';
  end if;

  select * into v_ev from public.sponsored_events where id = p_event_id for update;
  if not found then
    raise exception 'No such partnership.' using errcode = 'P0001';
  end if;
  if v_ev.status not in ('in_progress', 'confirmed') then
    raise exception 'Only an active partnership can be cancelled (this one is %).', v_ev.status
      using errcode = 'P0001';
  end if;

  -- `withdrawn` takes it out of everything that keys on confirmed: registration,
  -- the public page, discovery, the settled-deal indexes (so the campaign can be
  -- matched again). cancelled_at is what tells it apart from a sibling proposal
  -- that simply lost.
  update public.sponsored_events
     set status = 'withdrawn', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_reason
   where id = p_event_id;

  update public.sponsored_event_cancellation_requests
     set status = 'accepted', decided_by = auth.uid(), decided_at = now(),
         admin_note = nullif(btrim(coalesce(p_note, '')), '')
   where sponsored_event_id = p_event_id and status = 'pending';

  -- Codes not yet handed out stay on file but can't be issued any more
  -- (reward_codes_block_cancelled below).
  select count(*) into v_unused
    from public.reward_code_pool where sponsored_event_id = p_event_id and assigned_at is null;

  -- The brand and the artist.
  select b.profile_id into v_brand from public.brands b where b.id = v_ev.brand_id;
  foreach v_party in array array_remove(array[v_brand, v_ev.artist_profile_id], null) loop
    perform public.notify_from_db(
      'sponsorship.cancelled', v_party,
      jsonb_build_object('event_name', v_ev.name, 'reference', coalesce(v_ev.reference, ''), 'reason', v_reason),
      '/dashboard/sponsored/' || p_event_id);
  end loop;

  -- Everyone registered — with a line for those already holding a code.
  for v_part in
    select p.id, p.audience_profile_id,
           exists (select 1 from public.reward_codes c
                    where c.participation_id = p.id and c.status <> 'void') as has_code
      from public.participations p
     where p.sponsored_event_id = p_event_id and p.status <> 'rejected'
  loop
    v_people := v_people + 1;
    if v_part.has_code then v_holders := v_holders + 1; end if;
    perform public.notify_from_db(
      'participation.event_cancelled', v_part.audience_profile_id,
      jsonb_build_object(
        'event_name', v_ev.name,
        'reason', v_reason,
        'code_note', case when v_part.has_code
          then 'The discount code you received for it may no longer be usable — the organiser''s ticketing platform decides that. We''re sorry for the inconvenience.'
          else 'Nothing is needed from you.' end),
      '/dashboard/participations');
  end loop;

  -- The waitlist.
  for v_wait in
    update public.event_waitlist set cancelled_at = now()
     where sponsored_event_id = p_event_id
       and promoted_at is null and left_at is null and cancelled_at is null
    returning profile_id
  loop
    v_waiting := v_waiting + 1;
    perform public.notify_from_db(
      'participation.event_cancelled', v_wait.profile_id,
      jsonb_build_object('event_name', v_ev.name, 'reason', v_reason,
                         'code_note', 'You were on the waitlist — nothing is needed from you.'),
      '/dashboard/participations');
  end loop;

  -- Paid invoices, so the admin can go straight to a refund or credit note.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'reference', i.reference, 'amount_gbp', i.amount_gbp,
           'refunded_gbp', coalesce(i.refunded_gbp, 0)) order by i.created_at), '[]'::jsonb)
    into v_invoices
    from public.invoices i
   where i.status = 'paid'
     and (i.sponsored_event_id = p_event_id
          or (v_ev.campaign_id is not null and i.campaign_id = v_ev.campaign_id));

  perform public.log_admin_action('sponsored_event.cancelled', 'sponsored_event', p_event_id::text,
    jsonb_build_object(
      'reference', v_ev.reference, 'was', v_ev.status, 'reason', v_reason, 'note', p_note,
      'participants_notified', v_people, 'code_holders', v_holders,
      'waitlist_notified', v_waiting, 'unused_codes_withheld', v_unused,
      'paid_invoices', v_invoices));

  return jsonb_build_object(
    'participants', v_people, 'code_holders', v_holders, 'waitlist', v_waiting,
    'unused_codes', v_unused, 'paid_invoices', v_invoices, 'campaign_id', v_ev.campaign_id);
end;
$$;
revoke all on function public.admin_cancel_sponsored_event(uuid, text, text) from public, anon;
grant execute on function public.admin_cancel_sponsored_event(uuid, text, text) to authenticated;

-- Signed-in users read sponsored_events only while confirmed/completed, so
-- once an event is cancelled the people registered (or waitlisted) for it would
-- see a blank card. They may still read that one event.
create or replace function public.can_see_cancelled_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.participations
             where sponsored_event_id = p_event_id and audience_profile_id = auth.uid())
    or exists (select 1 from public.event_waitlist
                where sponsored_event_id = p_event_id and profile_id = auth.uid()))
$$;
revoke all on function public.can_see_cancelled_event(uuid) from public, anon;
grant execute on function public.can_see_cancelled_event(uuid) to authenticated;

drop policy if exists "sponsored_events: participants read cancelled" on public.sponsored_events;
create policy "sponsored_events: participants read cancelled" on public.sponsored_events
  for select using (cancelled_at is not null and public.can_see_cancelled_event(id));

-- No code is issued for a cancelled event, by anyone. auto_issue_reward_code()'s
-- callers already catch errors (0075), so this only stops the issue.
create or replace function public.reward_codes_block_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.sponsored_events
              where id = new.sponsored_event_id and cancelled_at is not null) then
    raise exception 'EVENT_CANCELLED: codes are no longer issued for this event' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists reward_codes_block_cancelled on public.reward_codes;
create trigger reward_codes_block_cancelled
  before insert on public.reward_codes
  for each row execute function public.reward_codes_block_cancelled();

-- ---------------------------------------------------------------------------
-- 5. Registration cap + waitlist
-- ---------------------------------------------------------------------------
-- Is there a place left? Locks the event row so two people can't take the last
-- place at once. Definer: the counts span other people's rows.
create or replace function public.event_take_place(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
begin
  select registration_cap into v_cap from public.sponsored_events where id = p_event_id for update;
  return v_cap is null or public.event_registered_count(p_event_id) < v_cap;
end;
$$;
revoke all on function public.event_take_place(uuid) from public, anon;
grant execute on function public.event_take_place(uuid) to authenticated;

create or replace function public.participations_cap_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Admins and promotions from the waitlist (definer) go through.
  if not public.is_untrusted_writer() then
    return new;
  end if;
  if not public.event_take_place(new.sponsored_event_id) then
    raise exception 'EVENT_FULL: this event has reached its registration limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists participations_cap_guard on public.participations;
create trigger participations_cap_guard
  before insert on public.participations
  for each row execute function public.participations_cap_guard();

-- Give free places to the longest-waiting people. Returns how many moved up.
create or replace function public.promote_event_waitlist(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev       record;
  v_next     record;
  v_part_id  uuid;
  v_moved    integer := 0;
begin
  select id, name, status, cancelled_at, registration_cap, event_date,
         coalesce(timezone, 'Europe/London') as tz
    into v_ev
    from public.sponsored_events where id = p_event_id for update;
  if not found or v_ev.status <> 'confirmed' or v_ev.cancelled_at is not null then
    return 0;
  end if;
  if v_ev.event_date is not null and v_ev.event_date < (now() at time zone v_ev.tz)::date then
    return 0;
  end if;

  loop
    exit when v_ev.registration_cap is not null
          and public.event_registered_count(p_event_id) >= v_ev.registration_cap;
    select * into v_next from public.event_waitlist
     where sponsored_event_id = p_event_id
       and promoted_at is null and left_at is null and cancelled_at is null
     order by created_at
     limit 1
     for update skip locked;
    exit when not found;

    v_part_id := null;
    begin
      insert into public.participations
        (sponsored_event_id, audience_profile_id, status, terms_accepted_at, newsletter_opt_in)
      values (p_event_id, v_next.profile_id, 'registered', v_next.terms_accepted_at, v_next.newsletter_opt_in)
      on conflict do nothing
      returning id into v_part_id;
    exception when others then
      raise warning 'promote_event_waitlist (event %, profile %) failed: %', p_event_id, v_next.profile_id, sqlerrm;
      -- Leave them waiting rather than lose their place; stop for now.
      exit;
    end;

    update public.event_waitlist
       set promoted_at = now(), promoted_participation_id = v_part_id
     where id = v_next.id;

    if v_part_id is not null then
      v_moved := v_moved + 1;
      perform public.notify_from_db(
        'participation.promoted', v_next.profile_id,
        jsonb_build_object('event_name', v_ev.name),
        '/dashboard/participations#event-' || v_part_id);
    end if;
  end loop;
  return v_moved;
end;
$$;
revoke all on function public.promote_event_waitlist(uuid) from public, anon, authenticated;

create or replace function public.participations_promote_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.promote_event_waitlist(coalesce(new.sponsored_event_id, old.sponsored_event_id));
  exception when others then
    raise warning 'waitlist promotion after % failed: %', tg_op, sqlerrm;
  end;
  return coalesce(new, old);
end;
$$;

drop trigger if exists participations_promote_on_delete on public.participations;
create trigger participations_promote_on_delete
  after delete on public.participations
  for each row execute function public.participations_promote_waitlist();

drop trigger if exists participations_promote_on_reject on public.participations;
create trigger participations_promote_on_reject
  after update of status on public.participations
  for each row when (new.status = 'rejected' and old.status is distinct from new.status)
  execute function public.participations_promote_waitlist();

create or replace function public.sponsored_events_promote_on_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.promote_event_waitlist(new.id);
  exception when others then
    raise warning 'waitlist promotion after cap change failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists sponsored_events_promote_on_cap on public.sponsored_events;
create trigger sponsored_events_promote_on_cap
  after update of registration_cap on public.sponsored_events
  for each row when (new.registration_cap is distinct from old.registration_cap)
  execute function public.sponsored_events_promote_on_cap();

-- Join the waitlist of a full event. Returns {status, position}:
--   registered  — already has a place
--   not_full    — there is a place; register normally
--   waitlisted  — on the list (position = place in the queue)
--   full        — the waitlist is full too
create or replace function public.join_event_waitlist(p_event_id uuid, p_newsletter_opt_in boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_ev   record;
  v_pos  integer;
  v_size integer;
begin
  if v_uid is null then
    raise exception 'Please sign in first.' using errcode = '42501';
  end if;
  if (select role from public.profiles where id = v_uid) <> 'audience' then
    raise exception 'Only audience accounts can join a waitlist.' using errcode = '42501';
  end if;

  select id, name, status, cancelled_at, registration_cap, participation_deadline, event_date, campaign_id,
         coalesce(timezone, 'Europe/London') as tz
    into v_ev
    from public.sponsored_events where id = p_event_id for update;
  if not found or v_ev.status <> 'confirmed' or v_ev.cancelled_at is not null then
    raise exception 'Registration for this event is closed' using errcode = 'P0001';
  end if;
  if not public.campaign_is_open(v_ev.campaign_id) then
    raise exception 'REGISTRATION_NOT_OPEN: registration for this event has not opened yet' using errcode = 'P0001';
  end if;
  if v_ev.participation_deadline is not null and v_ev.participation_deadline < now() then
    raise exception 'The registration deadline has passed' using errcode = 'P0001';
  end if;
  if v_ev.event_date is not null and v_ev.event_date < (now() at time zone v_ev.tz)::date then
    raise exception 'This event has already taken place' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.participations
              where sponsored_event_id = p_event_id and audience_profile_id = v_uid) then
    return jsonb_build_object('status', 'registered');
  end if;
  if v_ev.registration_cap is null or public.event_registered_count(p_event_id) < v_ev.registration_cap then
    return jsonb_build_object('status', 'not_full');
  end if;

  if not exists (select 1 from public.event_waitlist
                  where sponsored_event_id = p_event_id and profile_id = v_uid
                    and promoted_at is null and left_at is null and cancelled_at is null) then
    v_size := public.event_waitlist_size(v_ev.registration_cap);
    if public.event_waitlist_count(p_event_id) >= v_size then
      return jsonb_build_object('status', 'full');
    end if;
    insert into public.event_waitlist (sponsored_event_id, profile_id, newsletter_opt_in)
    values (p_event_id, v_uid, coalesce(p_newsletter_opt_in, false))
    on conflict (sponsored_event_id, profile_id) do update
      set created_at = now(), terms_accepted_at = now(), newsletter_opt_in = excluded.newsletter_opt_in,
          promoted_at = null, promoted_participation_id = null, left_at = null, cancelled_at = null;
    select count(*)::integer into v_pos from public.event_waitlist
     where sponsored_event_id = p_event_id
       and promoted_at is null and left_at is null and cancelled_at is null;
    perform public.notify_from_db(
      'participation.waitlisted', v_uid,
      jsonb_build_object('event_name', v_ev.name, 'position', v_pos::text),
      '/dashboard/participations#waitlist');
  end if;

  select q.pos into v_pos from (
    select w.profile_id, row_number() over (order by w.created_at)::integer as pos
      from public.event_waitlist w
     where w.sponsored_event_id = p_event_id
       and w.promoted_at is null and w.left_at is null and w.cancelled_at is null) q
   where q.profile_id = v_uid;
  return jsonb_build_object('status', 'waitlisted', 'position', v_pos);
end;
$$;
revoke all on function public.join_event_waitlist(uuid, boolean) from public, anon;
grant execute on function public.join_event_waitlist(uuid, boolean) to authenticated;

create or replace function public.leave_event_waitlist(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_waitlist set left_at = now()
   where sponsored_event_id = p_event_id and profile_id = auth.uid()
     and promoted_at is null and left_at is null and cancelled_at is null;
end;
$$;
revoke all on function public.leave_event_waitlist(uuid) from public, anon;
grant execute on function public.leave_event_waitlist(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Surveys close when they should
-- ---------------------------------------------------------------------------
-- Why this survey won't take an answer from this person, or null if it will.
-- Reasons: campaign_ended | event_cancelled | event_passed | deadline_passed |
-- full | not_open. Internal: the respondent is passed in, so it isn't granted.
create or replace function public.survey_closed_reason_for(
  p_template_id      uuid,
  p_profile_id       uuid,
  p_participation_id uuid default null
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tpl        record;
  v_campaign   text;
  v_ev         record;
  v_registered boolean;
  v_waiting    boolean;
begin
  select id, kind, campaign_id into v_tpl from public.survey_templates where id = p_template_id;
  if not found or v_tpl.campaign_id is null then
    return null;
  end if;

  select status::text into v_campaign from public.campaigns where id = v_tpl.campaign_id;
  if v_campaign in ('closed', 'completed') then
    return 'campaign_ended';
  end if;

  select id, status, cancelled_at, event_date, participation_deadline, registration_cap,
         coalesce(timezone, 'Europe/London') as tz
    into v_ev
    from public.sponsored_events
   where campaign_id = v_tpl.campaign_id and status in ('confirmed', 'completed')
   order by created_at desc
   limit 1;

  if not found then
    -- Nothing confirmed. If a deal was cancelled, the survey stays shut until a
    -- replacement is confirmed (a proposal still being agreed doesn't count).
    if exists (select 1 from public.sponsored_events
                where campaign_id = v_tpl.campaign_id and cancelled_at is not null) then
      return 'event_cancelled';
    end if;
    if v_tpl.kind = 'pre_event' and not public.campaign_is_open(v_tpl.campaign_id) then
      return 'not_open';
    end if;
    return null;
  end if;

  -- A post-event survey runs until the campaign is completed or closed.
  if v_tpl.kind <> 'pre_event' then
    return null;
  end if;

  if not public.campaign_is_open(v_tpl.campaign_id) then
    return 'not_open';
  end if;
  if v_ev.status = 'completed'
     or (v_ev.event_date is not null and v_ev.event_date < (now() at time zone v_ev.tz)::date) then
    return 'event_passed';
  end if;

  v_registered := p_participation_id is not null
    or exists (select 1 from public.participations
                where sponsored_event_id = v_ev.id and audience_profile_id = p_profile_id
                  and status <> 'rejected');
  if v_registered then
    return null;
  end if;
  v_waiting := exists (select 1 from public.event_waitlist
                        where sponsored_event_id = v_ev.id and profile_id = p_profile_id
                          and promoted_at is null and left_at is null and cancelled_at is null);
  if v_waiting then
    return null;
  end if;

  -- Not registered yet: answering registers them, so registration's rules apply.
  if v_ev.participation_deadline is not null and v_ev.participation_deadline < now() then
    return 'deadline_passed';
  end if;
  if v_ev.registration_cap is not null
     and public.event_registered_count(v_ev.id) >= v_ev.registration_cap
     and public.event_waitlist_count(v_ev.id) >= public.event_waitlist_size(v_ev.registration_cap) then
    return 'full';
  end if;
  return null;
end;
$$;
revoke all on function public.survey_closed_reason_for(uuid, uuid, uuid) from public, anon, authenticated;

-- The page's question, for the signed-in caller (admins are never refused).
create or replace function public.survey_closed_reason(p_template_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then null
              else public.survey_closed_reason_for(p_template_id, auth.uid(), null) end
$$;
revoke all on function public.survey_closed_reason(uuid) from public, anon;
grant execute on function public.survey_closed_reason(uuid) to anon, authenticated, service_role;

-- 0070's gate, extended. The SURVEY_NOT_OPEN text is unchanged (the app matches
-- on it); everything else that closes a survey raises SURVEY_ENDED:<reason>.
create or replace function public.survey_responses_require_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if public.is_admin() then
    return new;
  end if;
  v_reason := public.survey_closed_reason_for(
    new.template_id,
    coalesce(new.respondent_profile_id, auth.uid()),
    new.participation_id);
  if v_reason is null then
    return new;
  end if;
  if v_reason = 'not_open' then
    raise exception 'SURVEY_NOT_OPEN: this survey has not opened yet' using errcode = 'P0001';
  end if;
  raise exception 'SURVEY_ENDED:%: this survey is no longer taking answers', v_reason using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. "Codes ran out" alarm
-- ---------------------------------------------------------------------------
create table if not exists public.reward_code_outages (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references public.sponsored_events (id) on delete cascade,
  started_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  brand_alerted_at   timestamptz
);
create unique index if not exists reward_code_outages_one_open
  on public.reward_code_outages (sponsored_event_id) where resolved_at is null;

alter table public.reward_code_outages enable row level security;
drop policy if exists "reward_code_outages: admin" on public.reward_code_outages;
create policy "reward_code_outages: admin" on public.reward_code_outages
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "reward_code_outages: parties read" on public.reward_code_outages;
create policy "reward_code_outages: parties read" on public.reward_code_outages
  for select using (public.is_sponsored_event_party(sponsored_event_id));
grant select on public.reward_code_outages to authenticated;
grant all on public.reward_code_outages to service_role;

-- Can any of this event's tiers still hand out a code? (The same test the
-- "why no code?" diagnostic uses.)
create or replace function public.sponsored_event_can_issue(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sponsored_event_reward_tiers t
     where t.sponsored_event_id = p_event_id
       and (t.participant_cap is null
            or (select count(*) from public.reward_codes c
                 where c.tier_id = t.id and c.status <> 'void') < t.participant_cap)
       and ((t.distribution_model = 'shared' and t.shared_code is not null)
            or (coalesce(t.distribution_model, '') <> 'shared'
                and exists (select 1 from public.reward_code_pool pl
                             where pl.tier_id = t.id and pl.assigned_at is null)))
  )
$$;
revoke all on function public.sponsored_event_can_issue(uuid) from public, anon, authenticated;

create or replace function public.reward_outage_check(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev    record;
  v_admin record;
begin
  select id, name, reference, status, cancelled_at, artist_profile_id, event_date,
         coalesce(timezone, 'Europe/London') as tz
    into v_ev
    from public.sponsored_events where id = p_event_id;
  if not found then
    return;
  end if;

  if public.sponsored_event_can_issue(p_event_id) then
    update public.reward_code_outages set resolved_at = now()
     where sponsored_event_id = p_event_id and resolved_at is null;
    return;
  end if;

  -- Only a live event that HAS been issuing codes has "run out"; one that never
  -- had any is a set-up gap, which the Waiting-on-artists tab already shows.
  if v_ev.status <> 'confirmed' or v_ev.cancelled_at is not null
     or (v_ev.event_date is not null and v_ev.event_date < (now() at time zone v_ev.tz)::date)
     or not exists (select 1 from public.reward_codes where sponsored_event_id = p_event_id) then
    return;
  end if;

  insert into public.reward_code_outages (sponsored_event_id) values (p_event_id)
  on conflict do nothing;
  if not found then
    return; -- already alerted for this outage
  end if;

  for v_admin in select id from public.profiles where role = 'admin' and is_active loop
    perform public.notify_from_db(
      'admin.codes_ran_out', v_admin.id,
      jsonb_build_object('event_name', v_ev.name, 'reference', coalesce(v_ev.reference, '')),
      '/dashboard/admin/events/sponsored/' || p_event_id || '#reward-engine');
  end loop;
  if v_ev.artist_profile_id is not null then
    perform public.notify_from_db(
      'sponsorship.codes_ran_out', v_ev.artist_profile_id,
      jsonb_build_object('event_name', v_ev.name, 'reference', coalesce(v_ev.reference, '')),
      '/dashboard/sponsored/' || p_event_id || '?codes=out#discount-codes');
  end if;
end;
$$;
revoke all on function public.reward_outage_check(uuid) from public, anon, authenticated;

create or replace function public.reward_outage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.reward_outage_check(coalesce(new.sponsored_event_id, old.sponsored_event_id));
  exception when others then
    raise warning 'reward_outage_check failed: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reward_codes_outage_check on public.reward_codes;
create trigger reward_codes_outage_check
  after insert on public.reward_codes
  for each row execute function public.reward_outage_trigger();

-- Issuing writes the code first and marks the pool code used afterwards
-- (0075), so the pool's own changes are what show a pool running dry — and
-- new pool rows are what close an outage.
drop trigger if exists reward_code_pool_outage_check on public.reward_code_pool;
create trigger reward_code_pool_outage_check
  after insert or delete or update of assigned_at on public.reward_code_pool
  for each row execute function public.reward_outage_trigger();

drop trigger if exists reward_tiers_outage_check on public.sponsored_event_reward_tiers;
create trigger reward_tiers_outage_check
  after insert or update on public.sponsored_event_reward_tiers
  for each row execute function public.reward_outage_trigger();

-- The Waiting-on-artists tab lists "codes ran out" as something the artist
-- owes, with the usual Nudge button (0110), so its log takes the new kind.
do $$
begin
  if to_regclass('public.artist_nudges') is not null then
    alter table public.artist_nudges drop constraint if exists artist_nudges_kind_check;
    alter table public.artist_nudges add constraint artist_nudges_kind_check
      check (kind in ('agreement', 'fulfilment', 'codes', 'codes_out'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Notifications (catalogue + settings + templates)
-- ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.cancellation_requested', 'Cancellation requested',
   'A brand or artist asked the team to cancel a partnership.',
   'admin', 'All admins', '{event_name,reference,requester,reason}', 470),
  ('sponsorship.cancellation_declined', 'Cancellation request declined',
   'The team declined a request to cancel a partnership.',
   'brand', 'The requester', '{user_name,event_name,reference,note}', 241),
  ('sponsorship.cancelled', 'Partnership cancelled',
   'The team cancelled a partnership. Sent to the brand and the artist.',
   'brand', 'The brand and the artist / organiser', '{user_name,event_name,reference,reason}', 242),
  ('participation.event_cancelled', 'Event cancelled',
   'An event someone registered for (or was waitlisted for) has been cancelled.',
   'audience', 'The audience member', '{user_name,event_name,reason,code_note}', 330),
  ('admin.codes_ran_out', 'Discount codes ran out',
   'A live event can no longer issue discount codes (pool empty or caps reached).',
   'admin', 'All admins', '{event_name,reference}', 471),
  ('sponsorship.codes_ran_out', 'Discount codes ran out',
   'Your event can no longer issue discount codes — add more.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference}', 243),
  ('brand.codes_ran_out', 'Discount codes still out',
   'Sent to the brand when an event has had no discount codes to give for 48 hours.',
   'brand', 'The brand', '{user_name,event_name,reference}', 244),
  ('participation.waitlisted', 'Added to the waitlist',
   'The event was full, so the audience member joined its waitlist.',
   'audience', 'The audience member', '{user_name,event_name,position}', 331),
  ('participation.promoted', 'A place opened up',
   'Someone on the waitlist has been given a place.',
   'audience', 'The audience member', '{user_name,event_name}', 332)
on conflict (key) do nothing;

-- Settings rows. Where 0113's email button exists, the ones that ask someone to
-- act start with it on; inserted only when the row is new, so a re-run never
-- overrides an admin's later choice.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'notification_settings'
                and column_name = 'email_button') then
    insert into public.notification_settings (event_key, email_button)
    select key, key in ('admin.cancellation_requested', 'admin.codes_ran_out',
                        'sponsorship.codes_ran_out', 'participation.promoted')
      from public.notification_events
     where key in ('admin.cancellation_requested', 'sponsorship.cancellation_declined', 'sponsorship.cancelled',
                   'participation.event_cancelled', 'admin.codes_ran_out', 'sponsorship.codes_ran_out',
                   'brand.codes_ran_out', 'participation.waitlisted', 'participation.promoted')
    on conflict (event_key) do nothing;
  end if;
end $$;

insert into public.notification_settings (event_key)
select key from public.notification_events
 where key in ('admin.cancellation_requested', 'sponsorship.cancellation_declined', 'sponsorship.cancelled',
               'participation.event_cancelled', 'admin.codes_ran_out', 'sponsorship.codes_ran_out',
               'brand.codes_ran_out', 'participation.waitlisted', 'participation.promoted')
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select v.event_key, v.channel, v.subject, v.body
  from (values
    ('admin.cancellation_requested', 'in_app',
     'Cancellation requested: {{event_name}} ({{reference}})',
     '{{requester}} asked to cancel this partnership: "{{reason}}"'),
    ('admin.cancellation_requested', 'email',
     'Cancellation requested: {{event_name}} ({{reference}}) · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     '{{requester}} has asked the team to cancel {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
     'Their reason: "{{reason}}"' || chr(10) || chr(10) ||
     'Open the partnership to cancel it or decline the request. Nothing changes until you do.'),
    ('sponsorship.cancellation_declined', 'in_app',
     'Cancellation not agreed: {{event_name}}',
     'The team didn''t cancel {{event_name}} ({{reference}}). {{note}}'),
    ('sponsorship.cancellation_declined', 'email',
     'About your cancellation request for {{event_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'The team has looked at your request to cancel {{event_name}} ({{reference}}) and hasn''t cancelled it.' || chr(10) || chr(10) ||
     '{{note}}' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team'),
    ('sponsorship.cancelled', 'in_app',
     'Partnership cancelled: {{event_name}}',
     'The team has cancelled {{event_name}} ({{reference}}). Reason: {{reason}}'),
    ('sponsorship.cancelled', 'email',
     '{{event_name}} has been cancelled · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'The Live·En·Synergy team has cancelled the partnership for {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
     'Reason: {{reason}}' || chr(10) || chr(10) ||
     'Registrations and surveys for it have stopped and everyone registered has been told. The team will be in touch about what happens next.' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team'),
    ('participation.event_cancelled', 'in_app',
     '{{event_name}} has been cancelled',
     '{{event_name}} has been cancelled. {{code_note}}'),
    ('participation.event_cancelled', 'email',
     '{{event_name}} has been cancelled · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'We''re sorry to tell you that {{event_name}} has been cancelled.' || chr(10) || chr(10) ||
     '{{reason}}' || chr(10) || chr(10) ||
     '{{code_note}}' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team'),
    ('admin.codes_ran_out', 'in_app',
     'Codes ran out: {{event_name}} ({{reference}})',
     'This event can no longer issue discount codes. New survey responses will be held until codes are added.'),
    ('admin.codes_ran_out', 'email',
     'Discount codes ran out for {{event_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     '{{event_name}} ({{reference}}) can no longer issue discount codes — the pool is empty or every tier has reached its cap.' || chr(10) || chr(10) ||
     'The artist has been asked to add more. People who answer the survey in the meantime are held for review.'),
    ('sponsorship.codes_ran_out', 'in_app',
     'Discount codes ran out for {{event_name}}',
     'Every discount code for {{event_name}} has been given out. Please add more so new participants get theirs.'),
    ('sponsorship.codes_ran_out', 'email',
     'Please add more discount codes for {{event_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'Every discount code for {{event_name}} ({{reference}}) has now been given out, so new participants can''t receive one.' || chr(10) || chr(10) ||
     'Please add more codes from your partnership page (if you''ve already confirmed your codes, ask the team to reopen them first).' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team'),
    ('brand.codes_ran_out', 'in_app',
     'Discount codes still out for {{event_name}}',
     '{{event_name}} has had no discount codes to give for two days. The team is working with the artist on it.'),
    ('brand.codes_ran_out', 'email',
     'An update on discount codes for {{event_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'A quick update on {{event_name}} ({{reference}}): its discount codes ran out two days ago and haven''t been topped up yet. The team is working with the artist on it, and new participants are being held until codes are available.' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team'),
    ('participation.waitlisted', 'in_app',
     'You''re on the waitlist for {{event_name}}',
     'The event is full, so you''re number {{position}} on its waitlist. If a place opens up, it''s yours automatically and we''ll tell you.'),
    ('participation.waitlisted', 'email',
     'You''re on the waitlist for {{event_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     '{{event_name}} is full, so we''ve put you on its waitlist — you''re number {{position}}.' || chr(10) || chr(10) ||
     'If a place opens up, it goes to the next person on the list automatically and we''ll email you straight away. Any survey answers you''ve given are kept.' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team'),
    ('participation.promoted', 'in_app',
     'A place opened up — you''re in for {{event_name}}',
     'You''ve moved off the waitlist and are now registered for {{event_name}}.'),
    ('participation.promoted', 'email',
     'You''re in: a place opened up for {{event_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'Good news — a place opened up and you''re now registered for {{event_name}}.' || chr(10) || chr(10) ||
     'Check My events for your next step. If you''ve already answered the survey and it passed, your discount code is on its way.' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team')
  ) as v(event_key, channel, subject, body)
 where not exists (
   select 1 from public.notification_templates t
    where t.event_key = v.event_key and t.channel = v.channel
 );

-- ---------------------------------------------------------------------------
-- 9. Permissions. Supabase grants EXECUTE on every new function to anon and
-- authenticated directly, so `revoke ... from public` alone leaves them
-- callable (0107). Internal helpers and trigger functions are taken away from
-- clients explicitly; the client-facing ones were re-granted above.
-- ---------------------------------------------------------------------------
revoke all on function public.sponsored_events_cancel_guard() from public, anon, authenticated;
revoke all on function public.event_listings_deal_guard() from public, anon, authenticated;
revoke all on function public.reward_codes_block_cancelled() from public, anon, authenticated;
revoke all on function public.participations_cap_guard() from public, anon, authenticated;
revoke all on function public.participations_promote_waitlist() from public, anon, authenticated;
revoke all on function public.sponsored_events_promote_on_cap() from public, anon, authenticated;
revoke all on function public.reward_outage_trigger() from public, anon, authenticated;
revoke all on function public.survey_responses_require_open() from public, anon, authenticated;
