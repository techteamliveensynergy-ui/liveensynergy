-- =============================================================================
-- Live-En-Synergy — admin-only campaign creation
--
-- 24 Aug standup ("Aligned"): campaign creation moves to the admin team.
-- Brands submit an intake request (this migration's new table); only admin
-- turns one into a real `campaigns` row, so profile linking (brand↔artist)
-- and package assignment always go through the team.
--
-- This is the one migration in the batch that tightens write access on an
-- existing, populated table — apply with the same care as any change to a
-- live RLS policy, not as routine additive DDL. Nothing here deletes data:
-- existing campaigns and their read/update access are untouched; only
-- insert/delete move to admin-only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. campaign_intake_requests — where brand self-service now lives
-- ---------------------------------------------------------------------------
create type campaign_intake_status as enum ('submitted', 'in_review', 'converted', 'declined');

create table campaign_intake_requests (
  id                     uuid primary key default gen_random_uuid(),
  reference              text unique default ('INT-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  brand_id               uuid not null references brands (id) on delete cascade,
  description            text not null,
  -- Guidance only — never a committed figure. The real budget only exists
  -- once admin assigns a package (or a custom amount) at conversion.
  budget_expectation_gbp numeric(12, 2),
  category               text,
  category_other         text,
  preferred_location     text,
  preferred_timeline     text,
  target_name            text,
  reward_rules           text,
  expected_outcomes      text,
  additional_info        text,
  suggested_event_note   text,
  suggested_event_url    text,
  manager_name           text not null,
  manager_email          text not null,
  manager_phone          text not null,
  image_url              text,
  status                 campaign_intake_status not null default 'submitted',
  reviewed_by            uuid references profiles (id) on delete set null,
  reviewed_at            timestamptz,
  decline_reason         text,
  converted_campaign_id  uuid references campaigns (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on campaign_intake_requests (brand_id);
create index on campaign_intake_requests (status);
create trigger campaign_intake_requests_set_updated_at before update on campaign_intake_requests
  for each row execute function set_updated_at();

alter table campaign_intake_requests enable row level security;

create policy "campaign_intake_requests: brand owner or admin read"
  on campaign_intake_requests for select
  using (
    is_admin()
    or exists (select 1 from brands b where b.id = campaign_intake_requests.brand_id and b.profile_id = auth.uid())
  );

create policy "campaign_intake_requests: brand owner insert"
  on campaign_intake_requests for insert
  with check (
    status = 'submitted'
    and exists (select 1 from brands b where b.id = campaign_intake_requests.brand_id and b.profile_id = auth.uid())
  );

-- A brand may only edit/withdraw while we haven't started reviewing it yet;
-- once admin moves it to in_review/converted/declined the brand's own copy
-- becomes read-only (they use "Contact Live·En·Synergy" from there on).
create policy "campaign_intake_requests: brand owner update while submitted"
  on campaign_intake_requests for update
  using (
    status = 'submitted'
    and exists (select 1 from brands b where b.id = campaign_intake_requests.brand_id and b.profile_id = auth.uid())
  )
  with check (
    status = 'submitted'
    and exists (select 1 from brands b where b.id = campaign_intake_requests.brand_id and b.profile_id = auth.uid())
  );

create policy "campaign_intake_requests: brand owner delete while submitted"
  on campaign_intake_requests for delete
  using (
    status = 'submitted'
    and exists (select 1 from brands b where b.id = campaign_intake_requests.brand_id and b.profile_id = auth.uid())
  );

create policy "campaign_intake_requests: admin manage"
  on campaign_intake_requests for all
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- 2. campaigns — package link, margin snapshot
-- ---------------------------------------------------------------------------
alter table campaigns
  add column campaign_package_id         uuid references campaign_packages (id) on delete set null,
  add column package_platform_margin_gbp numeric(12, 2),
  add column package_participant_count   integer;

-- ---------------------------------------------------------------------------
-- 3. campaigns RLS — split the single `for all` policy so insert/delete
--    become admin-only while read/update stay exactly as they are today.
-- ---------------------------------------------------------------------------
drop policy if exists "campaigns: brand owner or admin" on campaigns;

create policy "campaigns: admin insert"
  on campaigns for insert
  with check (is_admin());

create policy "campaigns: brand owner or admin read"
  on campaigns for select
  using (
    is_admin()
    or exists (select 1 from brands b where b.id = campaigns.brand_id and b.profile_id = auth.uid())
  );

create policy "campaigns: brand owner or admin update"
  on campaigns for update
  using (
    is_admin()
    or exists (select 1 from brands b where b.id = campaigns.brand_id and b.profile_id = auth.uid())
  )
  with check (
    is_admin()
    or exists (select 1 from brands b where b.id = campaigns.brand_id and b.profile_id = auth.uid())
  );

create policy "campaigns: admin delete"
  on campaigns for delete
  using (is_admin());

-- ---------------------------------------------------------------------------
-- 4. open_campaigns view — carry the package margin through, so an
--    artist-initiated sponsorship against a packaged campaign can seed
--    remaining_budget_gbp correctly (netForCampaign() needs it and this view
--    is the only way an artist's RLS lets them see it).
-- ---------------------------------------------------------------------------
create or replace view open_campaigns as
  select
    c.id,
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
    b.logo_url    as brand_logo_url,
    b.product_category as brand_category,
    b.id          as brand_id,
    b.profile_id  as brand_profile_id,
    c.suggested_event_note,
    c.suggested_event_url,
    c.package_platform_margin_gbp
  from campaigns c
  join brands b on b.id = c.brand_id
  where c.status = 'in_progress'
    and c.matched_listing_id is null;

grant select on open_campaigns to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Notification events — same three-step insert as 0006/0008.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('campaign_intake.submitted','Request received','We received your campaign request.','brand','The brand','{user_name,reference}',431),
  ('admin.campaign_intake_received','New campaign request','A brand submitted a new campaign request.','admin','The admin team','{reference,brand_name,budget}',432),
  ('campaign_intake.converted','Campaign created','Your campaign request became a live campaign.','brand','The brand','{reference,campaign_reference}',433),
  ('campaign_intake.declined','Request declined','Your campaign request was declined.','brand','The brand','{reference,reason}',434)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body)
select e.key, 'in_app', e.name, coalesce(e.description, e.name)
from notification_events e
where not exists (
  select 1 from notification_templates t
  where t.event_key = e.key and t.channel = 'in_app'
);

insert into notification_templates (event_key, channel, subject, body)
select e.key,
       'email',
       e.name || ' · Live·En·Synergy',
       'Hi {{user_name}},' || chr(10) || chr(10) ||
       coalesce(e.description, e.name) || chr(10) || chr(10) ||
       '— The Live·En·Synergy team'
from notification_events e
where not exists (
  select 1 from notification_templates t
  where t.event_key = e.key and t.channel = 'email'
);
