-- =============================================================================
-- 0118 — Suggest events before payment (client, 10–11 Nov: "Suggest event"
-- should be available once the brief arrives, not only after the invoice is
-- paid; brands should look at the events and the artists first).
--
-- Until now an `awaiting_payment` campaign could not be matched at all (0049).
-- Now the team can suggest events while the invoice is outstanding, and:
--   * the BRAND sees them (its own rows, as ever) and can agree to one;
--   * the ARTIST sees nothing — the suggestion is hidden by RLS and the artist
--     can't agree to it — until the campaign is paid or waived;
--   * at that moment each suggested artist is notified, their listing is marked
--     "matched", and the normal flow (artist confirms, registration, survey)
--     carries on.
-- Registration, surveys and codes are untouched: they still can't start before
-- the campaign is paid.
--
-- Additive and re-runnable.
-- =============================================================================

-- 1. Is this campaign still waiting for payment? (definer: callers can't read
--    `campaigns` past RLS).
create or replace function public.sponsored_event_campaign_unpaid(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_campaign_id is not null
     and exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.status = 'awaiting_payment');
$$;
revoke all on function public.sponsored_event_campaign_unpaid(uuid) from public, anon;
grant execute on function public.sponsored_event_campaign_unpaid(uuid) to authenticated, service_role;

-- 2. The artist side of the party policy and helper no longer sees a
--    suggestion on an unpaid campaign. (Brand and admin unchanged.)
drop policy if exists "sponsored_events: parties or admin" on public.sponsored_events;
create policy "sponsored_events: parties or admin"
  on public.sponsored_events for all
  using (
    public.is_admin()
    or (artist_profile_id = auth.uid() and not public.sponsored_event_campaign_unpaid(campaign_id))
    or exists (
      select 1 from public.brands b
       where b.id = sponsored_events.brand_id and b.profile_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or (artist_profile_id = auth.uid() and not public.sponsored_event_campaign_unpaid(campaign_id))
    or exists (
      select 1 from public.brands b
       where b.id = sponsored_events.brand_id and b.profile_id = auth.uid()
    )
  );

create or replace function public.is_sponsored_event_party(event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.sponsored_events se
     where se.id = event_id
       and (
         (se.artist_profile_id = auth.uid() and not public.sponsored_event_campaign_unpaid(se.campaign_id))
         or exists (
           select 1 from public.brands b
            where b.id = se.brand_id and b.profile_id = auth.uid()
         )
       )
  );
$$;

-- 3. Only the team may stand up a sponsorship against an unpaid campaign (a
--    brand or artist still can't), and it starts un-agreed by the artist.
create or replace function public.sponsored_event_requires_open_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.campaign_id is not null and public.sponsored_event_campaign_unpaid(new.campaign_id) then
    -- Runs as the caller (not definer), so auth.uid() is the person acting;
    -- no session at all = the service role / a cron job.
    if not (public.is_admin() or auth.uid() is null) then
      raise exception
        'This campaign is awaiting payment, so only the team can suggest events for it yet.';
    end if;
    if new.artist_agreed then
      raise exception 'An artist can''t have agreed to an event before the campaign is paid.';
    end if;
  end if;
  return new;
end;
$$;

-- 4. The artist can't agree while the campaign is unpaid (they can't see it,
--    but agree_to_sponsorship() is a definer RPC — this is the backstop).
create or replace function public.sponsored_event_artist_waits_for_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.artist_agreed and not coalesce(old.artist_agreed, false)
     and public.sponsored_event_campaign_unpaid(new.campaign_id)
     and not public.is_admin() then
    raise exception 'The artist is asked to confirm once the campaign is paid.';
  end if;
  return new;
end;
$$;
drop trigger if exists sponsored_events_artist_waits_for_payment on public.sponsored_events;
create trigger sponsored_events_artist_waits_for_payment
  before update on public.sponsored_events
  for each row execute function public.sponsored_event_artist_waits_for_payment();

-- 5. Payment (or a waiver) opens the campaign: now the suggested artists are
--    told, and their listings are marked matched.
create or replace function public.campaign_paid_reveal_suggestions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if old.status = 'awaiting_payment' and new.status = 'in_progress' then
    for r in
      select se.id, se.name, se.reference, se.artist_profile_id, se.listing_id, b.brand_name
        from public.sponsored_events se
        left join public.brands b on b.id = se.brand_id
       where se.campaign_id = new.id and se.status = 'in_progress'
    loop
      if r.listing_id is not null then
        update public.event_listings set status = 'matched' where id = r.listing_id and status = 'available';
      end if;
      if r.artist_profile_id is not null then
        begin
          perform public.notify_from_db(
            'offer.proposal_received',
            r.artist_profile_id,
            jsonb_build_object(
              'brand_name', coalesce(r.brand_name, 'A brand'),
              'event_name', r.name,
              'reference', r.reference,
              'budget', 'as agreed with our team'
            ),
            '/dashboard/sponsored/' || r.id
          );
        exception when others then
          raise warning 'campaign_paid_reveal_suggestions: notify % failed: %', r.id, sqlerrm;
        end;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists campaigns_paid_reveal_suggestions on public.campaigns;
create trigger campaigns_paid_reveal_suggestions
  after update of status on public.campaigns
  for each row execute function public.campaign_paid_reveal_suggestions();

revoke all on function public.campaign_paid_reveal_suggestions() from public, anon, authenticated;
revoke all on function public.sponsored_event_artist_waits_for_payment() from public, anon, authenticated;
revoke all on function public.sponsored_event_requires_open_campaign() from public, anon, authenticated;

-- 6. Order form: more about the linked event (retest 11 Nov, items 18/49 —
--    capacity and the event / ticket link). Snapshotted from the listing when
--    the team picks the event, like the venue and date, and editable.
alter table public.campaign_order_forms
  add column if not exists event_capacity integer,
  add column if not exists event_link text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_order_forms_event_capacity_check') then
    alter table public.campaign_order_forms
      add constraint campaign_order_forms_event_capacity_check check (event_capacity is null or event_capacity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_order_forms_event_link_len') then
    alter table public.campaign_order_forms
      add constraint campaign_order_forms_event_link_len check (event_link is null or char_length(event_link) <= 1000);
  end if;
end $$;
