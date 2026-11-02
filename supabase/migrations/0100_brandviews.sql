-- =============================================================================
-- QA 31 Oct — what a brand sees on a partnered event
--
--   M-01  Brands must see participant AGGREGATES only, never names. 0021 let
--         both parties of a sponsorship read the profile of everyone who
--         registered; that is right for the artist (who verifies attendance at
--         the venue) and wrong for the brand. is_my_event_participant() now
--         matches the artist only. Admins are unaffected (is_admin() policies).
--
--   L-04  The brand's event page showed no category, capacity or ticket price
--         because event_listings is only readable while a listing is
--         'available' — once it is committed to a deal the brand's read returns
--         nothing. sponsored_event_listing_facts() hands the parties exactly
--         those event facts (nothing personal) through a definer function.
--
-- Additive: one function redefined, one function added. Nothing dropped.
-- =============================================================================

create or replace function is_my_event_participant(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.participations p
      join public.sponsored_events se on se.id = p.sponsored_event_id
     where p.audience_profile_id = p_profile_id
       and se.artist_profile_id = auth.uid()
  );
$$;

create or replace function sponsored_event_listing_facts(p_sponsored_event_id uuid)
returns table (
  category text,
  capacity integer,
  ticket_price_gbp numeric,
  venue_name text,
  city text,
  country text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.category, l.capacity, l.ticket_price_gbp, l.venue_name, l.city, l.country
    from public.sponsored_events se
    join public.event_listings l on l.id = se.listing_id
   where se.id = p_sponsored_event_id
     and (
       public.is_admin()
       or se.artist_profile_id = auth.uid()
       or exists (
         select 1 from public.brands b
          where b.id = se.brand_id and b.profile_id = auth.uid()
       )
     );
$$;

revoke all on function sponsored_event_listing_facts(uuid) from public;
grant execute on function sponsored_event_listing_facts(uuid) to authenticated;
