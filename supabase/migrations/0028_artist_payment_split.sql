-- =============================================================================
-- Live-En-Synergy — artist payment split
--
-- 24 Aug standup ("Aligned"): the remaining artist fee pays out only after
-- the artist submits a report verifying ticket sales. The split itself
-- (upfront vs. remainder) is admin-set per sponsorship, not a platform-wide
-- default — confirmed decision, so no percentage constant exists anywhere
-- here.
--
-- `sponsored_events.remaining_budget_gbp` is exclusively the audience reward
-- pool (unchanged by this migration) — these new columns are a completely
-- separate figure: what the platform itself owes the artist for running the
-- event, which never existed in the schema before.
-- =============================================================================

alter table sponsored_events
  add column artist_fee_gbp               numeric(12, 2),
  add column artist_upfront_gbp           numeric(12, 2),
  add column artist_upfront_paid_at       timestamptz,
  -- Stored explicitly (computed once when the split is set), not derived on
  -- read — if admin later edits artist_fee_gbp, an already-communicated
  -- remainder shouldn't silently move.
  add column artist_remainder_gbp         numeric(12, 2),
  add column artist_remainder_released_at timestamptz,
  add column artist_remainder_released_by uuid references profiles (id) on delete set null;

create table ticket_sales_reports (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references sponsored_events (id) on delete cascade,
  submitted_by       uuid not null references profiles (id) on delete cascade,
  tickets_sold       integer,
  gross_revenue_gbp  numeric(12, 2),
  -- private-uploads path, purpose "artist-sales-report" — revenue figures
  -- are commercially sensitive, same bucket ticket-proof already uses.
  report_file_path   text,
  notes              text,
  status             text not null default 'submitted' check (status in ('submitted', 'reviewed')),
  reviewed_by        uuid references profiles (id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index on ticket_sales_reports (sponsored_event_id);

alter table ticket_sales_reports enable row level security;

create policy "ticket_sales_reports: parties or admin read"
  on ticket_sales_reports for select
  using (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = ticket_sales_reports.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  );

-- Only the artist on this sponsorship (or admin) may submit a report — a
-- brand shouldn't be able to write a rival "sales" figure into the record.
create policy "ticket_sales_reports: artist insert own"
  on ticket_sales_reports for insert
  with check (
    submitted_by = auth.uid()
    and (
      is_admin()
      or exists (
        select 1 from sponsored_events se
        where se.id = ticket_sales_reports.sponsored_event_id
          and se.artist_profile_id = auth.uid()
      )
    )
  );

create policy "ticket_sales_reports: admin review"
  on ticket_sales_reports for update
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- Notification events — same three-step insert as 0006/0008/0025.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('sponsorship.artist_split_set','Payment split set','Your upfront and remainder payment split was set.','artist','The artist','{event_name,reference,upfront,remainder}',439),
  ('sponsorship.upfront_paid','Upfront paid','Your upfront payment was marked as paid.','artist','The artist','{event_name,reference,upfront}',440),
  ('admin.ticket_sales_report_submitted','Ticket sales report submitted','An artist submitted a ticket sales report.','admin','The admin team','{event_name,reference,artist_name}',441),
  ('sponsorship.remainder_released','Remainder released','The remainder of your fee was released.','artist','The artist','{event_name,reference,remainder}',442)
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
