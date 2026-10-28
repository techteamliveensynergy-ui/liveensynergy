-- =============================================================================
-- 0092 — save a half-finished form and come back to it (GitHub #79).
--
-- General Notes: "Save details option while creating profile, event, or
-- campaign request". Event listings already have a draft state; campaign
-- requests and profile set-up didn't, so leaving the page lost everything.
--
-- One owner-only table for both, holding the form's text fields as typed:
--   kind 'campaign_request'                 any number per brand
--   kind 'onboarding_brand' / '_artist' /   one per account
--        '_event'
--
-- Why not a 'draft' status on campaign_intake_requests or a half-filled
-- brands/artists row: admins read every intake request (and are notified on
-- insert), and the rest of the app reads "has a brands row" as "onboarded".
-- A draft here is invisible to everyone but its owner — there is no admin
-- policy at all — until it is submitted through the normal action, which
-- validates in full and then deletes the draft.
--
-- Files aren't kept in drafts: images are uploaded on submit, so a deleted
-- or abandoned draft never leaves objects in storage. Abandoned drafts are
-- for the retention job (#38) to clear; suggested 90 days, to confirm.
--
-- Additive: one new table. Apply before deploying the code.
-- =============================================================================

create table if not exists form_drafts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null default auth.uid() references profiles (id) on delete cascade,
  kind        text not null check (kind in ('campaign_request', 'onboarding_brand', 'onboarding_artist', 'onboarding_event')),
  title       text check (title is null or length(title) <= 200),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 65536),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists form_drafts_owner_idx on form_drafts (profile_id, kind, updated_at desc);
-- Set-up drafts: one per account and form.
create unique index if not exists form_drafts_one_onboarding
  on form_drafts (profile_id, kind)
  where kind <> 'campaign_request';

alter table form_drafts enable row level security;

drop policy if exists "form_drafts: owner all" on form_drafts;
create policy "form_drafts: owner all" on form_drafts
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

revoke all on form_drafts from anon;
grant select, insert, update, delete on form_drafts to authenticated;
