-- =============================================================================
-- Live-En-Synergy — campaign interest register
--
-- "Register interest" on Discover Campaigns previously only fired two
-- notifications and redirected with ?registered=1. Nothing was stored, so the
-- banner vanished on the next page load, the card kept offering "Register
-- interest", and an artist had no way to tell whether it had worked — or
-- whether they'd already done it (raised in the 27 Jul standup).
--
-- Matching stays mediated by the Live-En-Synergy team, so this deliberately
-- does NOT open a conversation with the sponsor; it records the interest and
-- lets the team pick it up.
-- =============================================================================

create table campaign_interests (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  note         text,
  created_at   timestamptz not null default now(),
  -- One standing interest per artist per campaign. The action upserts on this,
  -- so a double click is a no-op rather than a duplicate notification.
  unique (campaign_id, profile_id)
);

create index on campaign_interests (campaign_id);
create index on campaign_interests (profile_id);

alter table campaign_interests enable row level security;

-- The interested party sees and manages their own rows.
create policy "campaign_interests: owner read"
  on campaign_interests for select
  to authenticated
  using (profile_id = auth.uid() or is_admin());

create policy "campaign_interests: owner insert"
  on campaign_interests for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "campaign_interests: owner delete"
  on campaign_interests for delete
  to authenticated
  using (profile_id = auth.uid() or is_admin());

-- Admins need the whole picture to broker matches.
create policy "campaign_interests: admin update"
  on campaign_interests for update
  to authenticated
  using (is_admin())
  with check (is_admin());
