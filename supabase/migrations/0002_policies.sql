-- =============================================================================
-- Live-En-Synergy — Row Level Security policies
-- Principle: every user can read/write only their own rows; admins see all;
-- a few tables expose limited public/counterparty read access where the
-- product requires it (event discovery, sponsor↔artist chat, contact form).
-- =============================================================================

alter table profiles           enable row level security;
alter table brands             enable row level security;
alter table artists            enable row level security;
alter table event_organisers   enable row level security;
alter table audience_members   enable row level security;
alter table campaigns          enable row level security;
alter table event_listings     enable row level security;
alter table sponsored_events   enable row level security;
alter table participations     enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table contact_messages   enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read own or admin"
  on profiles for select
  using (id = auth.uid() or is_admin());

create policy "profiles: insert own"
  on profiles for insert
  with check (id = auth.uid());

create policy "profiles: update own"
  on profiles for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- Owner-scoped role tables (brands / artists / event_organisers / audience)
-- ---------------------------------------------------------------------------
create policy "brands: owner or admin"
  on brands for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

create policy "artists: owner or admin"
  on artists for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

create policy "event_organisers: owner or admin"
  on event_organisers for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

create policy "audience_members: owner or admin"
  on audience_members for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- campaigns — owned via the brand row
-- ---------------------------------------------------------------------------
create policy "campaigns: brand owner or admin"
  on campaigns for all
  using (
    is_admin()
    or exists (
      select 1 from brands b
      where b.id = campaigns.brand_id and b.profile_id = auth.uid()
    )
  )
  with check (
    is_admin()
    or exists (
      select 1 from brands b
      where b.id = campaigns.brand_id and b.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- event_listings — owner writes; available listings are publicly readable
-- ---------------------------------------------------------------------------
create policy "event_listings: public read available"
  on event_listings for select
  using (status = 'available' or owner_profile_id = auth.uid() or is_admin());

create policy "event_listings: owner insert"
  on event_listings for insert
  with check (owner_profile_id = auth.uid() or is_admin());

create policy "event_listings: owner update"
  on event_listings for update
  using (owner_profile_id = auth.uid() or is_admin())
  with check (owner_profile_id = auth.uid() or is_admin());

create policy "event_listings: owner delete"
  on event_listings for delete
  using (owner_profile_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- sponsored_events — visible/editable by the brand and the artist involved
-- ---------------------------------------------------------------------------
create policy "sponsored_events: parties or admin"
  on sponsored_events for all
  using (
    is_admin()
    or artist_profile_id = auth.uid()
    or exists (
      select 1 from brands b
      where b.id = sponsored_events.brand_id and b.profile_id = auth.uid()
    )
  )
  with check (
    is_admin()
    or artist_profile_id = auth.uid()
    or exists (
      select 1 from brands b
      where b.id = sponsored_events.brand_id and b.profile_id = auth.uid()
    )
  );

-- Confirmed / completed events are readable by any signed-in user so the
-- audience can discover them and see the events they've registered for.
create policy "sponsored_events: public read confirmed"
  on sponsored_events for select
  using (status in ('confirmed', 'completed'));

-- ---------------------------------------------------------------------------
-- participations — audience owns their own; the event's artist & admin can read
-- ---------------------------------------------------------------------------
create policy "participations: audience owner"
  on participations for all
  using (audience_profile_id = auth.uid())
  with check (audience_profile_id = auth.uid());

create policy "participations: event party read"
  on participations for select
  using (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      where se.id = participations.sponsored_event_id
        and (
          se.artist_profile_id = auth.uid()
          or exists (
            select 1 from brands b
            where b.id = se.brand_id and b.profile_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- conversations / messages — only the two participants (or admin)
-- ---------------------------------------------------------------------------
create policy "conversations: participants"
  on conversations for all
  using (
    brand_profile_id = auth.uid()
    or partner_profile_id = auth.uid()
    or is_admin()
  )
  with check (
    brand_profile_id = auth.uid()
    or partner_profile_id = auth.uid()
    or is_admin()
  );

create policy "messages: read as participant"
  on messages for select
  using (
    is_admin()
    or exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.brand_profile_id = auth.uid() or c.partner_profile_id = auth.uid())
    )
  );

create policy "messages: send as participant"
  on messages for insert
  with check (
    sender_profile_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.brand_profile_id = auth.uid() or c.partner_profile_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- contact_messages — anyone may submit; only admins may read
-- ---------------------------------------------------------------------------
create policy "contact_messages: public insert"
  on contact_messages for insert
  with check (true);

create policy "contact_messages: admin read"
  on contact_messages for select
  using (is_admin());
