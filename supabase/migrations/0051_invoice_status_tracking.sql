-- =============================================================================
-- Live-En-Synergy — invoice status tracking + resend.
--
-- Admins need to see where every invoice stands (draft / unpaid / overdue /
-- paid / cancelled) and to resend one when a brand has a problem with it.
-- "Overdue" is derived in the app (a sent invoice past its due date — see
-- invoiceDisplayStatus() in src/lib/billing.ts), so it is never stale and
-- needs no scheduled job; the stored status stays 'sent'.
-- All additive.
-- =============================================================================

alter table invoices
  add column if not exists resend_count   int not null default 0,
  add column if not exists last_resent_at timestamptz,
  add column if not exists last_resent_by uuid references profiles (id) on delete set null,
  add column if not exists cancelled_at   timestamptz,
  add column if not exists cancelled_by   uuid references profiles (id) on delete set null,
  add column if not exists cancel_reason  text;

insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('invoice.reminder','Invoice resent','An admin resent an invoice to the brand.','brand','The brand','{reference,amount,due_date,invoice_link}',449),
  ('invoice.cancelled','Invoice cancelled','An invoice the brand had received was cancelled.','brand','The brand','{reference,reason}',450)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('invoice.reminder', 'in_app', 'Invoice {{reference}}',
   'Here is invoice {{reference}} for {{amount}} again — due {{due_date}}.'),
  ('invoice.reminder', 'email', 'Invoice {{reference}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Here is invoice {{reference}} for {{amount}} (including VAT) again. It is due {{due_date}} — please quote the invoice reference when you pay.' || chr(10) || chr(10) ||
   'View your invoice: {{invoice_link}}' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('invoice.cancelled', 'in_app', 'Invoice {{reference}} cancelled',
   'Invoice {{reference}} has been cancelled: {{reason}}'),
  ('invoice.cancelled', 'email', 'Invoice {{reference}} cancelled · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Invoice {{reference}} has been cancelled, so there is nothing to pay against it. Reason: {{reason}}' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
