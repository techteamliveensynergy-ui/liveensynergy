-- =============================================================================
-- Live-En-Synergy — invoicing
--
-- docs/payments-kyc-strategy.md §6 item 3: "Invoice + payment reference per
-- sponsorship, quoting the existing SPE-00001 reference so a bank transfer
-- can be reconciled." Scoped deliberately narrow — an invoice-reference and
-- status data model, admin sends it via an (initially stubbed) external API.
-- No on-platform payment collection, no Stripe/Wise integration here —
-- `paid_at` is set by hand on bank-transfer reconciliation, same as every
-- other money-in-this-schema figure until that's built.
-- =============================================================================

create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');

create table invoices (
  id                   uuid primary key default gen_random_uuid(),
  reference            text unique default ('INV-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  sponsored_event_id   uuid references sponsored_events (id) on delete set null,
  campaign_id          uuid references campaigns (id) on delete set null,
  brand_id             uuid not null references brands (id) on delete cascade,
  amount_gbp           numeric(12, 2) not null,
  status               invoice_status not null default 'draft',
  -- The id the eventual vendor's API returns — null until sendInvoiceAction()
  -- actually calls one (src/lib/invoicing.ts, currently a stub).
  external_invoice_ref text,
  sent_at              timestamptz,
  sent_by              uuid references profiles (id) on delete set null,
  paid_at              timestamptz,
  due_date             date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on invoices (brand_id);
create index on invoices (sponsored_event_id);
create trigger invoices_set_updated_at before update on invoices
  for each row execute function set_updated_at();

alter table invoices enable row level security;

create policy "invoices: brand owner or admin read"
  on invoices for select
  using (
    is_admin()
    or exists (select 1 from brands b where b.id = invoices.brand_id and b.profile_id = auth.uid())
  );

create policy "invoices: admin manage"
  on invoices for all
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- Notification events — same three-step insert as 0006/0008/0025.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('invoice.sent','Invoice sent','An invoice was sent for your sponsorship.','brand','The brand','{reference,amount}',445),
  ('invoice.paid','Invoice paid','Your payment was received and reconciled.','brand','The brand','{reference,amount}',446)
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
