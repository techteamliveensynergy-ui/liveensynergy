-- =============================================================================
-- 0067 — A real campaign name (client feedback, 13 Oct).
--
-- Requests and campaigns had no name of their own: lists titled them with
-- "artist / event in mind" or, failing that, the event category — so a
-- brand's campaign read as "Conferences". The only name lived on the order
-- form (campaign_order_forms.campaign_name, 0054).
--
--   campaign_intake_requests.campaign_name — the brand names its request.
--   campaigns.campaign_name                — carried over on conversion,
--                                            editable by admin.
--
-- Backfill (L4): each campaign takes its order form's name where it has one,
-- and each converted request takes its campaign's name, so existing rows read
-- the same as new ones. The app falls back to the old title when still empty.
-- Additive; covered by the existing owner/admin policies on both tables.
-- =============================================================================

alter table campaign_intake_requests
  add column if not exists campaign_name text check (campaign_name is null or length(campaign_name) <= 120);

alter table campaigns
  add column if not exists campaign_name text check (campaign_name is null or length(campaign_name) <= 120);

update campaigns c
   set campaign_name = left(btrim(f.campaign_name), 120)
  from campaign_order_forms f
 where f.campaign_id = c.id
   and c.campaign_name is null
   and nullif(btrim(f.campaign_name), '') is not null;

update campaign_intake_requests r
   set campaign_name = c.campaign_name
  from campaigns c
 where r.converted_campaign_id = c.id
   and r.campaign_name is null
   and c.campaign_name is not null;
