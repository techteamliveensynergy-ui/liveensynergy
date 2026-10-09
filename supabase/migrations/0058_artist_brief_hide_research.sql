-- =============================================================================
-- Live-En-Synergy — Artist campaign brief: drop the Research participant count.
--
-- The Admin Portal brief marks four order-form sections "ok for artist to
-- see": campaign information, linked event, participant benefit and artist
-- social media. 0054's campaign_order_briefs view also carried
-- approx_participants, which belongs to the Research section. The artist
-- screen never rendered it, but any signed-in artist could read it straight
-- from the view through the SDK. This re-declares the view without it.
--
-- `create or replace view` can't drop a column, so drop and re-create (with
-- the same grant). Nothing else depends on the view.
-- =============================================================================

drop view if exists campaign_order_briefs;

create view campaign_order_briefs as
  select f.id,
         f.reference,
         c.reference        as campaign_reference,
         f.campaign_name,
         f.campaign_objective,
         f.campaign_timeline,
         f.artist_name,
         f.event_name,
         f.event_reference,
         f.event_date,
         f.event_venue,
         f.event_location,
         f.discount_reward,
         f.rewards_available,
         f.redemption_arrangements,
         f.social_media_details,
         b.brand_name,
         f.approved_at
    from campaign_order_forms f
    join campaigns c on c.id = f.campaign_id
    join brands b on b.id = f.brand_id
   where f.status = 'approved'
     and (f.artist_profile_id = auth.uid() or is_admin());

grant select on campaign_order_briefs to authenticated;
