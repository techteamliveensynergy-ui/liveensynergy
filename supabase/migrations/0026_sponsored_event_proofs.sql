-- =============================================================================
-- Live-En-Synergy — sponsored event proofs
--
-- New-model "any other terms" section: an artist owes the sponsor a number of
-- social-media mentions and onsite branding. Each is its own typed upload
-- with a review status, not another row in `sponsored_event_assets` — assets
-- are undifferentiated pre-event branding creatives on a fixed 5-slot
-- uploader; proofs are post-event evidence tied to a specific contractual
-- term, uploaded by one party, and need approve/reject.
-- =============================================================================

create type sponsored_event_proof_type   as enum ('social_mention', 'onsite_branding');
create type sponsored_event_proof_status as enum ('submitted', 'approved', 'rejected');

create table sponsored_event_proofs (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references sponsored_events (id) on delete cascade,
  proof_type         sponsored_event_proof_type not null,
  url                text not null,
  description        text,
  uploaded_by        uuid not null references profiles (id) on delete cascade,
  status             sponsored_event_proof_status not null default 'submitted',
  reviewed_by        uuid references profiles (id) on delete set null,
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz not null default now()
);
create index on sponsored_event_proofs (sponsored_event_id);
create index on sponsored_event_proofs (proof_type);

alter table sponsored_event_proofs enable row level security;

-- Same "parties or admin" shape as sponsored_event_assets (0008) — either
-- side of the deal can read every proof; only the uploader or admin can
-- insert their own; only admin can review (update status).
create policy "sponsored_event_proofs: parties or admin read"
  on sponsored_event_proofs for select
  using (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = sponsored_event_proofs.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  );

create policy "sponsored_event_proofs: party insert own upload"
  on sponsored_event_proofs for insert
  with check (
    uploaded_by = auth.uid()
    and (
      is_admin()
      or exists (
        select 1 from sponsored_events se
        left join brands b on b.id = se.brand_id
        where se.id = sponsored_event_proofs.sponsored_event_id
          and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
      )
    )
  );

create policy "sponsored_event_proofs: admin review"
  on sponsored_event_proofs for update
  using (is_admin())
  with check (is_admin());

create policy "sponsored_event_proofs: admin delete"
  on sponsored_event_proofs for delete
  using (is_admin());

-- ---------------------------------------------------------------------------
-- Notification events — same three-step insert as 0006/0008/0025.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.sponsored_proof_submitted','Proof submitted','A party uploaded proof for a sponsorship term.','admin','The admin team','{event_name,reference,proof_type}',435),
  ('sponsored.proof_reviewed','Proof reviewed','Your submitted proof was reviewed.','artist','The uploader','{event_name,reference,proof_type,status}',436)
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
