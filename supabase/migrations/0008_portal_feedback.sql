-- =============================================================================
-- Live-En-Synergy — Artist/Brand portal review feedback (24–25 Jul 2026)
--
-- Backs the changes requested in the Artist Portal / Brand Portal review notes
-- and the 24 Jul standup:
--   * campaign "expected outcomes", campaign manager phone, campaign artwork
--   * artwork on event listings and sponsored events
--   * branding guidelines + up to 5 described brand assets per sponsored event
--   * a participation deadline that carries a time, not just a date
--   * how audience attendance gets confirmed at the venue
--   * conversation categories (partner vs. Live-En-Synergy team) + per-campaign
--     threads + chat attachments
--   * an in-product bug / idea reporting inbox
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Showcase video links on the three profile types. Artists and brands asked to
-- be able to add a reel alongside their images; a link keeps us out of video
-- hosting, which the standup agreed was out of scope for V1.
-- ---------------------------------------------------------------------------
alter table artists           add column video_url text;
alter table event_organisers  add column video_url text;
alter table brands            add column video_url text;

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
alter table campaigns
  add column expected_outcomes text,
  add column manager_phone     text,
  add column image_url         text;

comment on column campaigns.expected_outcomes is
  'What the sponsor expects to receive in return (branding, content, mentions).';

-- ---------------------------------------------------------------------------
-- open_campaigns — the artist-side "Discover campaigns" browse surface.
--
-- Artists need to see what sponsors are looking for, but campaigns carry the
-- campaign manager's name/email/phone. Rather than loosening RLS on the table
-- and relying on every caller to pick safe columns, expose a view that simply
-- does not contain them. The view is not security_invoker, so it reads past
-- the owner-only policy on campaigns by design.
-- ---------------------------------------------------------------------------
create view open_campaigns as
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
    b.product_category as brand_category
  from campaigns c
  join brands b on b.id = c.brand_id
  where c.status = 'in_progress'
    and c.matched_listing_id is null;

grant select on open_campaigns to authenticated;

-- ---------------------------------------------------------------------------
-- event_listings — artists asked to add artwork to an event
-- ---------------------------------------------------------------------------
alter table event_listings
  add column image_url text;

-- ---------------------------------------------------------------------------
-- sponsored_events
-- ---------------------------------------------------------------------------
alter table sponsored_events
  add column banner_url           text,
  add column branding_guidelines  text,
  add column attendance_method    text,
  add column artist_display_name  text;

comment on column sponsored_events.attendance_method is
  'Free text describing how the audience proves they physically attended.';
comment on column sponsored_events.artist_display_name is
  'Artist/act name shown on the sponsorship when no listing is linked.';

-- The deadline needs a time of day, not just a date. Existing dates land at
-- 23:59 local-to-UTC so nobody loses a day of sign-ups on migration.
alter table sponsored_events
  alter column participation_deadline type timestamptz
  using (participation_deadline::timestamp + time '23:59');

-- ---------------------------------------------------------------------------
-- sponsored_event_assets — branding creatives shared by both parties
-- ---------------------------------------------------------------------------
create table sponsored_event_assets (
  id                  uuid primary key default gen_random_uuid(),
  sponsored_event_id  uuid not null references sponsored_events (id) on delete cascade,
  url                 text not null,
  description         text,
  uploaded_by         uuid references profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index on sponsored_event_assets (sponsored_event_id);

alter table sponsored_event_assets enable row level security;

-- Same "parties to the sponsorship, or admin" rule as sponsored_events itself.
create policy "sponsored_event_assets: parties or admin"
  on sponsored_event_assets for all
  using (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = sponsored_event_assets.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  )
  with check (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = sponsored_event_assets.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- conversations / messages — categories, campaign threads, attachments
-- ---------------------------------------------------------------------------
create type conversation_kind as enum ('partner', 'support');

alter table conversations
  add column kind        conversation_kind not null default 'partner',
  add column campaign_id uuid references campaigns (id) on delete set null,
  add column subject     text;

create index on conversations (campaign_id);

-- The original uniqueness rule keyed only on (brand, partner, listing), so a
-- support thread and a campaign thread would collide on (brand, partner, null).
-- Looked up by shape rather than by name: the generated name is 64 chars and
-- Postgres truncates it to 63, so hardcoding it is a coin flip.
do $$
declare
  c_name text;
begin
  select con.conname into c_name
  from pg_constraint con
  where con.conrelid = 'conversations'::regclass
    and con.contype = 'u';
  if c_name is not null then
    execute format('alter table conversations drop constraint %I', c_name);
  end if;
end $$;

create unique index conversations_unique_thread
  on conversations (
    brand_profile_id,
    partner_profile_id,
    coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind
  );

alter table messages
  add column attachment_url  text,
  add column attachment_name text,
  add column attachment_type text;

-- ---------------------------------------------------------------------------
-- feedback_reports — in-product bug / idea reporting
-- ---------------------------------------------------------------------------
create type feedback_kind   as enum ('bug', 'idea', 'improvement', 'text_change');
create type feedback_status as enum ('open', 'in_progress', 'resolved', 'wont_fix');

create table feedback_reports (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique default ('FB-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  profile_id     uuid references profiles (id) on delete set null,
  kind           feedback_kind   not null default 'bug',
  subject        text not null,
  body           text not null,
  page_url       text,
  screenshot_url text,
  status         feedback_status not null default 'open',
  admin_notes    text,
  resolved_at    timestamptz,
  resolved_by    uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on feedback_reports (profile_id);
create index feedback_reports_triage_idx
  on feedback_reports (status, created_at desc);

create trigger feedback_reports_set_updated_at before update on feedback_reports
  for each row execute function set_updated_at();

alter table feedback_reports enable row level security;

create policy "feedback_reports: own read"
  on feedback_reports for select
  using (profile_id = auth.uid() or is_admin());

create policy "feedback_reports: own insert"
  on feedback_reports for insert
  with check (profile_id = auth.uid());

create policy "feedback_reports: admin update"
  on feedback_reports for update
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Public profile pages.
--
-- artists / event_organisers / brands are all owner-only under RLS, so a
-- public page can't read them directly. Same trick as open_campaigns: expose
-- views holding only the columns that are meant to be seen, and leave every
-- contact detail, address, date of birth and internal matching field behind.
-- ---------------------------------------------------------------------------
create view public_artist_profiles as
  select
    a.profile_id,
    a.artist_name,
    a.stage_name,
    a.bio,
    a.category,
    a.category_other,
    a.profile_image_url,
    a.banner_url,
    a.website_url,
    a.video_url,
    a.social_links,
    a.sponsor_value_details,
    a.created_at
  from artists a
  join profiles p on p.id = a.profile_id
  where p.is_active and p.onboarding_completed;

create view public_organiser_profiles as
  select
    e.profile_id,
    e.event_name,
    e.description,
    e.category,
    e.category_other,
    e.profile_image_url,
    e.banner_url,
    e.website_url,
    e.video_url,
    e.social_links,
    e.sponsor_value_details,
    e.created_at
  from event_organisers e
  join profiles p on p.id = e.profile_id
  where p.is_active and p.onboarding_completed;

create view public_brand_profiles as
  select
    b.profile_id,
    b.brand_name,
    b.description,
    b.product_category,
    b.product_category_other,
    b.logo_url,
    b.banner_url,
    b.website_url,
    b.video_url,
    b.social_links,
    b.created_at
  from brands b
  join profiles p on p.id = b.profile_id
  where p.is_active and p.onboarding_completed;

-- Public pages are readable signed-out, hence anon as well as authenticated.
grant select on public_artist_profiles    to anon, authenticated;
grant select on public_organiser_profiles to anon, authenticated;
grant select on public_brand_profiles     to anon, authenticated;

-- ---------------------------------------------------------------------------
-- New notification events. `notify()` no-ops on an unseeded key, so the
-- catalogue, the default settings row and the starter templates all have to
-- land together — same three-step insert as 0006.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('campaign.interest_registered','Interest registered','An artist or organiser registered interest in a campaign.','artist','The artist / organiser','{user_name,campaign_reference,brand_name}',260),
  ('admin.campaign_interest','Artist interested in a campaign','An artist or organiser wants to be matched to a campaign.','admin','The admin team','{user_name,campaign_reference,brand_name}',440),
  ('admin.feedback_received','New feedback report','A user submitted a bug, idea or text change.','admin','The admin team','{user_name,reference,kind,subject}',450),
  ('feedback.acknowledged','Feedback received','We logged their bug or improvement report.','account','The reporter','{user_name,reference,subject}',80),
  ('feedback.resolved','Feedback resolved','Their report was marked resolved.','account','The reporter','{user_name,reference,subject}',90)
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

-- ---------------------------------------------------------------------------
-- Category rename: "Sportsperson" became "Sports", and Gaming / Conference
-- were added alongside it (src/lib/constants.ts ARTIST_CATEGORIES).
-- ---------------------------------------------------------------------------
update artists   set category = 'Sports' where category = 'Sportsperson';
update campaigns set category = 'Sports' where category = 'Sportsperson';
