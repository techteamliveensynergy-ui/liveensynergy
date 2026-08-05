-- =============================================================================
-- Live-En-Synergy — make accepting a sponsorship atomic and exclusive
--
-- 0021 let a campaign carry several suggested events, with the first one both
-- parties agree to closing the campaign and withdrawing the rest. That works
-- when the steps happen one after another, which is how it was tested. It does
-- not survive two people acting at once, and it doesn't consider a listing
-- that was put forward for more than one campaign.
--
-- Three ways the old application-level flow could produce a conflict:
--
--   1. Two proposals on the SAME CAMPAIGN confirmed together. Both agreements
--      read `status = 'in_progress'`, both passed, both wrote `confirmed`.
--      `close_campaign_on_acceptance` only withdraws siblings still in
--      progress, so neither withdrew the other: one campaign, one budget, two
--      live sponsorships.
--
--   2. The SAME LISTING confirmed against two different campaigns — the artist
--      committed the same event to two sponsors, each believing it exclusive.
--
--   3. A campaign that already had a settled sponsorship could still be
--      offered more suggestions, because the "suggest more" gate looked at the
--      campaign's own status rather than at whether anything had settled.
--
-- The fix is to stop deciding this in application code. `agree_to_sponsorship`
-- takes a row lock, re-checks the conflicts inside the same transaction, and
-- either confirms or refuses with a reason the UI can show. The partial unique
-- indexes at the foot are the backstop, so even a caller bypassing the
-- function cannot create a double booking.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- agree_to_sponsorship — record one party's agreement, and settle the deal if
-- that was the second one.
--
-- Returns jsonb so a single round trip carries the outcome, the reason it was
-- refused (if it was), and the proposals that got withdrawn (so the caller can
-- notify their owners):
--
--   { "outcome": "agreed" | "withdrew_agreement" | "confirmed"
--                | "conflict" | "not_party" | "locked",
--     "reason": text | null,
--     "withdrawn": [ { "id", "name", "artist_profile_id" }, ... ] }
-- ---------------------------------------------------------------------------
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
                  when 'withdrawn' then 'This proposal was withdrawn — the sponsor confirmed a different event for this campaign.'
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
       set status = 'closed',
           matched_listing_id = coalesce(v_event.listing_id, c.matched_listing_id)
     where c.id = v_event.campaign_id;

    with losers as (
      update sponsored_events se
         set status = 'withdrawn'
       where se.campaign_id = v_event.campaign_id
         and se.id <> p_event_id
         and se.status = 'in_progress'
      returning se.id, se.name, se.artist_profile_id, se.listing_id
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
               'id', l.id, 'name', l.name, 'artist_profile_id', l.artist_profile_id)),
             '[]'::jsonb)
      into v_withdrawn
      from losers l;
  end if;

  return jsonb_build_object('outcome', 'confirmed', 'reason', null, 'withdrawn', v_withdrawn);
end;
$$;

grant execute on function agree_to_sponsorship(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Backstop indexes: at most one settled sponsorship per campaign, and per
-- listing. The function above is what produces a good error message; these
-- make the bad state unrepresentable regardless of how it's reached.
--
-- Wrapped, like the phone indexes in 0021, so a database that already holds a
-- conflict reports it rather than failing the whole migration. Any notice here
-- names real data that needs resolving by hand.
-- ---------------------------------------------------------------------------
do $$
declare
  stmt record;
begin
  for stmt in
    select * from (values
      ('sponsored_events_one_settled_per_campaign',
       $q$create unique index sponsored_events_one_settled_per_campaign
            on sponsored_events (campaign_id)
            where campaign_id is not null and status in ('confirmed','completed')$q$),
      ('sponsored_events_one_settled_per_listing',
       $q$create unique index sponsored_events_one_settled_per_listing
            on sponsored_events (listing_id)
            where listing_id is not null and status in ('confirmed','completed')$q$)
    ) as t(name, ddl)
  loop
    if to_regclass('public.' || stmt.name) is not null then
      continue;
    end if;
    begin
      execute stmt.ddl;
    exception when unique_violation then
      raise notice
        'Skipped %: existing rows already hold a conflicting settled sponsorship. Resolve them, then create the index by hand.',
        stmt.name;
    end;
  end loop;
end
$$;
