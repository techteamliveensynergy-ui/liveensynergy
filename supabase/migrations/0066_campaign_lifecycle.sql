-- =============================================================================
-- 0066 — Campaign lifecycle: Live stage, Completed / Closed with notes and
-- reasons, reopen, and the status history (feedback FB-00031, 13 Oct).
--
-- The four stored statuses stay (awaiting_payment / in_progress / completed /
-- closed). "Needs matching → Awaiting artist → Awaiting survey → Live" is a
-- stage DERIVED in the app from facts already stored (src/lib/campaign-stage.ts),
-- so nobody has to remember to update it. What changes here:
--
-- 1. campaign_status_events — who moved a campaign from what to what, when,
--    with the close reason and an optional note. Admin-read only: close
--    reasons are internal (client decision), and a column on `campaigns`
--    couldn't be hidden from the brand, who can read its own campaign row.
-- 2. admin_change_campaign_status(campaign, action, reason, note) — the one
--    way to complete, close or reopen. Admin-checked, row-locked, atomic:
--      complete  in_progress → completed (note optional)
--      close     awaiting_payment / in_progress → closed (reason required;
--                "other" needs a note). From awaiting_payment it also cancels
--                the campaign's unpaid invoices — the app voids the Stripe
--                copy first, as cancelInvoice() does.
--      reopen    completed / closed → the status it was closed from
--                (awaiting_payment stays awaiting payment, so reopening can
--                never skip the payment gate)
--    complete and close also withdraw proposals nobody agreed yet and free
--    their listings, and return them so the app can tell those artists.
-- 3. agree_to_sponsorship() no longer sets the campaign to 'closed' when a
--    sponsorship is agreed (it is the start of the campaign, not its end).
--    Re-declared from 0023 — the production body was checked identical to
--    that source apart from comments before this was written.
-- 4. open_campaigns also hides a campaign that already has an agreed
--    sponsorship (belt and braces: matched_listing_id is null when the agreed
--    sponsorship had no listing).
-- 5. sponsored_event_requires_open_campaign() also refuses new proposals
--    against a completed or closed campaign.
-- 6. Notification `sponsorship.campaign_ended` for the artists in (2) — the
--    existing `sponsorship.withdrawn` copy says the sponsor picked another
--    event, which isn't why.
--
-- No backfill: no campaign in production is currently closed by (3)
-- (CMP-00008/9 were closed by hand and have no sponsorship).
-- =============================================================================

-- 1. History --------------------------------------------------------------

create table if not exists campaign_status_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  from_status campaign_status not null,
  to_status   campaign_status not null,
  reason      text check (reason is null or reason in (
                'brand_cancelled', 'payment_not_received', 'no_suitable_artist',
                'duplicate_or_test', 'other')),
  note        text check (note is null or length(note) <= 1000),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists campaign_status_events_campaign_idx
  on campaign_status_events (campaign_id, created_at desc);

alter table campaign_status_events enable row level security;

drop policy if exists "campaign_status_events: admin read" on campaign_status_events;
create policy "campaign_status_events: admin read"
  on campaign_status_events for select
  using (is_admin());
-- No insert/update/delete policies: rows are written only by
-- admin_change_campaign_status() below.

-- 2. Complete / close / reopen ---------------------------------------------

create or replace function admin_change_campaign_status(
  p_campaign_id uuid,
  p_action      text,
  p_reason      text default null,
  p_note        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c         campaigns%rowtype;
  v_to        campaign_status;
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_from_last campaign_status;
  v_withdrawn jsonb := '[]'::jsonb;
  v_cancelled jsonb := '[]'::jsonb;
begin
  if not is_admin() then
    raise exception 'Only an admin can change a campaign''s status.' using errcode = '42501';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'The note is too long (1,000 characters at most).';
  end if;

  select * into v_c from campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign not found.';
  end if;

  if p_action = 'complete' then
    if v_c.status <> 'in_progress' then
      raise exception 'Only an open campaign can be marked completed.';
    end if;
    v_to := 'completed';
    v_reason := null;

  elsif p_action = 'close' then
    if v_c.status not in ('awaiting_payment', 'in_progress') then
      raise exception 'This campaign is already finished — reopen it first.';
    end if;
    if v_reason is null or v_reason not in (
         'brand_cancelled', 'payment_not_received', 'no_suitable_artist', 'duplicate_or_test', 'other') then
      raise exception 'Pick a reason for closing the campaign.';
    end if;
    if v_reason = 'other' and v_note is null then
      raise exception 'Add a note saying why — the reason is "Other".';
    end if;
    v_to := 'closed';

  elsif p_action = 'reopen' then
    if v_c.status not in ('completed', 'closed') then
      raise exception 'Only a completed or closed campaign can be reopened.';
    end if;
    v_reason := null;
    select e.from_status into v_from_last
      from campaign_status_events e
     where e.campaign_id = v_c.id and e.to_status = v_c.status
     order by e.created_at desc
     limit 1;
    if v_from_last is not null then
      v_to := case when v_from_last = 'awaiting_payment' then 'awaiting_payment' else 'in_progress' end;
    else
      -- Finished before this history existed: unpaid if it has a package
      -- invoice, none of them paid, and no waiver.
      v_to := case
        when v_c.payment_waived_at is null
         and exists (select 1 from invoices i where i.campaign_id = v_c.id and i.kind = 'campaign_package')
         and not exists (select 1 from invoices i where i.campaign_id = v_c.id and i.kind = 'campaign_package' and i.status = 'paid')
        then 'awaiting_payment'::campaign_status
        else 'in_progress'::campaign_status
      end;
    end if;

  else
    raise exception 'Unknown action.';
  end if;

  -- Closing an unpaid campaign: nothing should be left to pay.
  if p_action = 'close' and v_c.status = 'awaiting_payment' then
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'status', i.status)), '[]'::jsonb)
      into v_cancelled
      from invoices i
     where i.campaign_id = v_c.id and i.status in ('draft', 'sent', 'overdue');

    update invoices i
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = auth.uid(),
           cancel_reason = 'The campaign was closed.'
     where i.campaign_id = v_c.id and i.status in ('draft', 'sent', 'overdue');
  end if;

  -- A finished campaign leaves no proposal hanging.
  if p_action in ('complete', 'close') then
    with losers as (
      update sponsored_events se
         set status = 'withdrawn'
       where se.campaign_id = v_c.id
         and se.status = 'in_progress'
      returning se.id, se.reference, se.name, se.artist_profile_id, se.listing_id
    ),
    freed as (
      update event_listings el
         set status = 'available'
       where el.id in (select l.listing_id from losers l where l.listing_id is not null)
         and el.status = 'matched'
         and not exists (
           select 1 from sponsored_events s2
            where s2.listing_id = el.id and s2.status in ('confirmed', 'completed'))
      returning el.id
    )
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'id', l.id, 'reference', l.reference,
               'name', l.name, 'artist_profile_id', l.artist_profile_id)),
             '[]'::jsonb)
      into v_withdrawn
      from losers l;
  end if;

  update campaigns set status = v_to where id = v_c.id;

  insert into campaign_status_events (campaign_id, from_status, to_status, reason, note, created_by)
  values (v_c.id, v_c.status, v_to, v_reason, v_note, auth.uid());

  return jsonb_build_object(
    'from', v_c.status,
    'to', v_to,
    'withdrawn', v_withdrawn,
    'cancelled_invoices', v_cancelled);
end;
$$;

revoke all on function admin_change_campaign_status(uuid, text, text, text) from public, anon;
grant execute on function admin_change_campaign_status(uuid, text, text, text) to authenticated;

-- 3. Agreeing a sponsorship no longer closes its campaign -------------------

create or replace function agree_to_sponsorship(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event        record;
  v_is_brand     boolean := false;
  v_is_artist    boolean := false;
  v_brand_agreed boolean;
  v_artist_agreed boolean;
  v_clash        record;
  v_withdrawn    jsonb := '[]'::jsonb;
begin
  -- Lock the event for the rest of the transaction. A second agreement on the
  -- same row waits here rather than reading stale flags.
  select * into v_event
    from sponsored_events
   where id = p_event_id
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_party', 'reason', 'That sponsorship no longer exists.');
  end if;

  -- `security definer` bypasses RLS, so authorisation is explicit.
  v_is_artist := v_event.artist_profile_id = auth.uid();
  select exists (
    select 1 from brands b
     where b.id = v_event.brand_id and b.profile_id = auth.uid()
  ) into v_is_brand;

  if not (v_is_brand or v_is_artist) then
    return jsonb_build_object('outcome', 'not_party', 'reason', 'You are not a party to this sponsorship.');
  end if;

  if v_event.status <> 'in_progress' then
    return jsonb_build_object(
      'outcome', 'locked',
      'reason', case v_event.status
                  when 'withdrawn' then 'This proposal was withdrawn — the campaign was settled on a different event, or has ended.'
                  else 'This sponsorship is already confirmed; its terms are locked.'
                end);
  end if;

  v_brand_agreed  := case when v_is_brand  then not v_event.brand_agreed  else v_event.brand_agreed  end;
  v_artist_agreed := case when v_is_artist then not v_event.artist_agreed else v_event.artist_agreed end;

  -- Not the second agreement — just record it and stop.
  if not (v_brand_agreed and v_artist_agreed) then
    update sponsored_events
       set brand_agreed = v_brand_agreed,
           artist_agreed = v_artist_agreed
     where id = p_event_id;
    return jsonb_build_object(
      'outcome',
      case when (v_is_brand and not v_brand_agreed) or (v_is_artist and not v_artist_agreed)
           then 'withdrew_agreement' else 'agreed' end,
      'reason', null, 'withdrawn', v_withdrawn);
  end if;

  -- This agreement would confirm the deal. Take the campaign lock first so two
  -- siblings can't both get past the checks below, then look for anything
  -- already settled that this would clash with.
  if v_event.campaign_id is not null then
    perform 1 from campaigns where id = v_event.campaign_id for update;

    select se.reference, se.name into v_clash
      from sponsored_events se
     where se.campaign_id = v_event.campaign_id
       and se.id <> p_event_id
       and se.status in ('confirmed', 'completed')
     limit 1;

    if found then
      return jsonb_build_object(
        'outcome', 'conflict',
        'reason', format(
          'This campaign has already been settled on %s. Your agreement was recorded but the sponsorship can''t be confirmed — contact the Live·En·Synergy team.',
          v_clash.name));
    end if;
  end if;

  if v_event.listing_id is not null then
    select se.reference, se.name into v_clash
      from sponsored_events se
     where se.listing_id = v_event.listing_id
       and se.id <> p_event_id
       and se.status in ('confirmed', 'completed')
     limit 1;

    if found then
      return jsonb_build_object(
        'outcome', 'conflict',
        'reason', 'This event is already committed to another confirmed sponsorship. Contact the Live·En·Synergy team.');
    end if;
  end if;

  update sponsored_events
     set brand_agreed = true, artist_agreed = true, status = 'confirmed'
   where id = p_event_id;

  if v_event.campaign_id is not null then
    update campaigns c
       -- 0066: the campaign stays open (in_progress). It used to be set to
       -- 'closed' here, which told the brand "closed" at the very moment its
       -- campaign started. matched_listing_id (and the settled sponsorship,
       -- see open_campaigns below) is what takes it off the artists' list.
       set matched_listing_id = coalesce(v_event.listing_id, c.matched_listing_id)
     where c.id = v_event.campaign_id;

    with losers as (
      update sponsored_events se
         set status = 'withdrawn'
       where se.campaign_id = v_event.campaign_id
         and se.id <> p_event_id
         and se.status = 'in_progress'
      returning se.id, se.reference, se.name, se.artist_profile_id, se.listing_id
    ),
    freed as (
      update event_listings el
         set status = 'available'
       where el.id in (select l.listing_id from losers l where l.listing_id is not null)
         and (v_event.listing_id is null or el.id <> v_event.listing_id)
      returning el.id
    )
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'id', l.id, 'reference', l.reference,
               'name', l.name, 'artist_profile_id', l.artist_profile_id)),
             '[]'::jsonb)
      into v_withdrawn
      from losers l;
  end if;

  return jsonb_build_object('outcome', 'confirmed', 'reason', null, 'withdrawn', v_withdrawn);
end;
$$;

grant execute on function agree_to_sponsorship(uuid) to authenticated;

-- 4. Artists don't see a campaign that is already settled -----------------

create or replace view open_campaigns as
select c.id,
       c.reference,
       c.description,
       c.expected_outcomes,
       c.budget_gbp,
       c.category,
       c.category_other,
       c.preferred_location,
       c.preferred_timeline,
       c.reward_rules,
       c.image_url,
       c.created_at,
       b.brand_name,
       b.logo_url as brand_logo_url,
       b.product_category as brand_category,
       b.id as brand_id,
       b.profile_id as brand_profile_id,
       c.suggested_event_note,
       c.suggested_event_url,
       c.package_platform_margin_gbp
  from campaigns c
  join brands b on b.id = c.brand_id
 where c.status = 'in_progress'::campaign_status
   and c.matched_listing_id is null
   and not exists (
     select 1 from sponsored_events se
      where se.campaign_id = c.id and se.status in ('confirmed', 'completed'));

-- 5. No new proposals against a finished campaign -------------------------

create or replace function sponsored_event_requires_open_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status campaign_status;
begin
  if new.campaign_id is null then
    return new;
  end if;
  select c.status into v_status from public.campaigns c where c.id = new.campaign_id;
  if v_status = 'awaiting_payment' then
    raise exception
      'This campaign is awaiting payment, so it cannot be matched or proposed against yet.';
  end if;
  if v_status in ('completed', 'closed') then
    raise exception
      'This campaign has finished, so it cannot be matched or proposed against.';
  end if;
  return new;
end;
$$;

-- 6. Telling artists their proposal ended with the campaign -----------------

insert into notification_events (key, name, description, category, audience, variables, sort_order)
select 'sponsorship.campaign_ended',
       'Proposal withdrawn (campaign ended)',
       'A proposal nobody had agreed yet was withdrawn because its campaign was completed or closed.',
       e.category, e.audience, '{event_name,reference}', e.sort_order + 1
  from notification_events e
 where e.key = 'sponsorship.withdrawn'
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('sponsorship.campaign_ended', 'in_app', 'Proposal {{reference}} withdrawn',
   '{{event_name}} ({{reference}}) was withdrawn — the campaign it was proposed for has ended.'),
  ('sponsorship.campaign_ended', 'email', 'Proposal {{reference}} withdrawn · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Your proposal {{event_name}} ({{reference}}) has been withdrawn because the campaign it was proposed for has ended. Nothing more is needed from you.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
