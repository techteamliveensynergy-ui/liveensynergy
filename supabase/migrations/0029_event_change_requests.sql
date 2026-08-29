-- =============================================================================
-- Live-En-Synergy — event change requests
--
-- 24 Aug standup ("Aligned"): sponsors may request an event/artist change up
-- to 2 days before the event date. Today, once a sponsorship is confirmed,
-- `updateSponsoredEvent` refuses all edits and the only path is
-- `contactSupport()` — a generic chat thread with no date check at all. This
-- table records the request and admin's decision; APPLYING an approved
-- change still goes through the existing, tested EventEditForm path — two
-- steps rather than a generic patch mechanism. The 2-day cutoff itself is
-- application code (src/lib/event-time.ts's eventStartInstant()), not RLS —
-- it needs date+time+zone arithmetic RLS can't easily express.
-- =============================================================================

create type sponsored_event_change_request_status as enum ('pending', 'approved', 'declined');

create table sponsored_event_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references sponsored_events (id) on delete cascade,
  requested_by       uuid not null references profiles (id) on delete cascade,
  summary            text not null,
  -- Optional structured proposal for a future richer UI — summary is always
  -- the source of truth for what admin actually reads and decides on.
  requested_changes  jsonb,
  status             sponsored_event_change_request_status not null default 'pending',
  admin_response     text,
  resolved_by        uuid references profiles (id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index on sponsored_event_change_requests (sponsored_event_id);
create index on sponsored_event_change_requests (status);

alter table sponsored_event_change_requests enable row level security;

create policy "sponsored_event_change_requests: parties or admin read"
  on sponsored_event_change_requests for select
  using (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = sponsored_event_change_requests.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  );

create policy "sponsored_event_change_requests: party insert own"
  on sponsored_event_change_requests for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and (
      is_admin()
      or exists (
        select 1 from sponsored_events se
        left join brands b on b.id = se.brand_id
        where se.id = sponsored_event_change_requests.sponsored_event_id
          and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
      )
    )
  );

create policy "sponsored_event_change_requests: admin resolve"
  on sponsored_event_change_requests for update
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- Notification events — same three-step insert as 0006/0008/0025.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.sponsored_change_requested','Change requested','A party requested a change to a confirmed sponsorship.','admin','The admin team','{event_name,reference,summary}',443),
  ('sponsored.change_resolved','Change request resolved','Your requested change was reviewed.','brand','The requester','{event_name,reference,status}',444)
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
