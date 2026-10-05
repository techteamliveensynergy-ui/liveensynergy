-- =============================================================================
-- Live-En-Synergy — send invoices through Stripe and mark them paid by webhook
-- (docs/payments-email-implementation-plan.md, Phase B/C).
--
-- "Send invoice" now creates a Stripe invoice in the ACTIVE mode (test/live,
-- Admin → Payment settings) when a verified key for that mode is saved; Stripe
-- emails the brand a hosted page to pay by card or bank transfer. When Stripe
-- reports the invoice paid, our webhook marks it paid and opens the campaign —
-- the same effect as an admin's "Mark paid". With no Stripe key saved, Send
-- behaves exactly as before (bank-transfer invoice, marked paid by hand).
-- =============================================================================

alter table invoices
  add column if not exists stripe_mode           text check (stripe_mode in ('test', 'live')),
  add column if not exists stripe_invoice_id     text unique,
  add column if not exists stripe_invoice_number text,
  add column if not exists hosted_invoice_url    text,
  add column if not exists invoice_pdf_url       text;

-- paid_source (0049) gains 'stripe' already; nothing to change there.

-- One Stripe customer per brand per mode (a test-mode customer doesn't exist in
-- live mode). Admin-managed; brands never read it.
create table if not exists brand_stripe_customers (
  brand_id           uuid not null references brands (id) on delete cascade,
  mode               text not null check (mode in ('test', 'live')),
  stripe_customer_id text not null,
  created_at         timestamptz not null default now(),
  primary key (brand_id, mode)
);
alter table brand_stripe_customers enable row level security;
create policy "brand_stripe_customers: admin manage"
  on brand_stripe_customers for all using (is_admin()) with check (is_admin());

-- Every Stripe webhook event we receive, once (the unique id is how a retried
-- or duplicated delivery is recognised and ignored). Written by the webhook
-- (service role); admins can read it for troubleshooting.
create table if not exists payment_events (
  id              uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  mode            text not null check (mode in ('test', 'live')),
  type            text not null,
  stripe_object_id text,
  payload         jsonb,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  error           text
);
create index if not exists payment_events_received_idx on payment_events (received_at desc);
alter table payment_events enable row level security;
create policy "payment_events: admin read" on payment_events for select using (is_admin());
revoke insert, update, delete on payment_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- stripe_mark_invoice_paid — the webhook's version of mark_invoice_paid():
-- same atomic "invoice paid + campaign opened" step, but called by our server
-- (service role) after it has verified the event with Stripe, so there is no
-- admin session. Idempotent: a second delivery returns {already: true}.
-- p_open_campaign=false records the payment without opening the campaign
-- (used when a TEST payment arrives while production is in LIVE mode).
-- ---------------------------------------------------------------------------
create or replace function stripe_mark_invoice_paid(
  p_stripe_invoice_id text, p_mode text, p_open_campaign boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv    public.invoices%rowtype;
  v_opened boolean := false;
begin
  select * into v_inv from public.invoices
   where stripe_invoice_id = p_stripe_invoice_id and stripe_mode = p_mode
   for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if v_inv.status = 'paid' then
    return jsonb_build_object('found', true, 'already', true, 'invoice_id', v_inv.id);
  end if;
  if v_inv.status not in ('sent', 'overdue') then
    return jsonb_build_object('found', true, 'skipped', v_inv.status, 'invoice_id', v_inv.id);
  end if;

  update public.invoices
     set status = 'paid', paid_at = now(), paid_source = 'stripe', paid_by = null
   where id = v_inv.id;

  if p_open_campaign and v_inv.kind = 'campaign_package' and v_inv.campaign_id is not null then
    update public.campaigns
       set status = 'in_progress'
     where id = v_inv.campaign_id and status = 'awaiting_payment';
    v_opened := found;
  end if;

  return jsonb_build_object('found', true, 'invoice_id', v_inv.id,
                            'opened', v_opened, 'campaign_id', v_inv.campaign_id);
end;
$$;
revoke all on function stripe_mark_invoice_paid(text, text, boolean) from public, anon, authenticated;
grant execute on function stripe_mark_invoice_paid(text, text, boolean) to service_role;

-- An invoice voided in the Stripe dashboard is cancelled here too.
create or replace function stripe_mark_invoice_voided(p_stripe_invoice_id text, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.invoices
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
         cancel_reason = coalesce(cancel_reason, 'Voided in Stripe')
   where stripe_invoice_id = p_stripe_invoice_id and stripe_mode = p_mode
     and status in ('draft', 'sent', 'overdue')
  returning id into v_id;
  return jsonb_build_object('invoice_id', v_id);
end;
$$;
revoke all on function stripe_mark_invoice_voided(text, text) from public, anon, authenticated;
grant execute on function stripe_mark_invoice_voided(text, text) to service_role;

-- The webhook reads the active mode with no admin session.
create or replace function payment_active_mode()
returns text
language sql
security definer
set search_path = public
as $$ select active_mode from public.payment_settings where id $$;
revoke all on function payment_active_mode() from public, anon, authenticated;
grant execute on function payment_active_mode() to service_role;

-- ---------------------------------------------------------------------------
-- Notifications for what Stripe tells us.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('invoice.payment_failed','Invoice payment failed','A card payment on an invoice did not go through.','brand','The brand','{reference,invoice_link}',451),
  ('admin.invoice_paid','Invoice paid (Stripe)','Stripe reported an invoice as paid.','admin','All admins','{reference,brand_name,amount}',942),
  ('admin.invoice_payment_failed','Invoice payment failed','A brand''s payment attempt on an invoice failed.','admin','All admins','{reference,brand_name}',943)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('invoice.payment_failed', 'in_app', 'Payment didn''t go through',
   'Your payment for invoice {{reference}} didn''t go through. You can try again or pay by bank transfer from the invoice page.'),
  ('invoice.payment_failed', 'email', 'Payment didn''t go through · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Your payment for invoice {{reference}} didn''t go through. You can try again, or pay by bank transfer, from the invoice page: {{invoice_link}}' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.invoice_paid', 'in_app', 'Invoice {{reference}} paid',
   '{{brand_name}} paid invoice {{reference}} ({{amount}}) through Stripe.'),
  ('admin.invoice_paid', 'email', 'Invoice {{reference}} paid · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{brand_name}} paid invoice {{reference}} ({{amount}}) through Stripe. If it was for a campaign, the campaign is now open to artists.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.invoice_payment_failed', 'in_app', 'Payment failed on {{reference}}',
   'A payment by {{brand_name}} on invoice {{reference}} failed.'),
  ('admin.invoice_payment_failed', 'email', 'Payment failed on {{reference}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'A payment by {{brand_name}} on invoice {{reference}} failed. The brand has been told and can try again.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
