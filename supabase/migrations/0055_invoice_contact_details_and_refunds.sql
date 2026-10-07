-- =============================================================================
-- Live-En-Synergy — invoice contact/bank details + partial refunds
-- (5 Oct standup).
--
-- 1. Invoices and the invoice emails carry the team's WhatsApp number and
--    bank-transfer details. They are admin-entered settings (Sakshi supplies
--    the values), stored on the single payment_settings row. They are not
--    secret — every brand sees them on its invoice — so a definer function
--    hands them to any signed-in user; only admins can change them.
--
-- 2. Refunds are decided case by case (how far the campaign got), so an admin
--    enters the amount and a reason. Each refund is a row; for a Stripe-paid
--    invoice the money goes back through a Stripe credit note, otherwise the
--    row records a refund made by hand (bank transfer).
-- =============================================================================

alter table payment_settings
  add column if not exists invoice_whatsapp     text,
  add column if not exists invoice_bank_details text,
  add column if not exists invoice_contact_note text;

create or replace function invoice_contact_details()
returns table (whatsapp text, bank_details text, contact_note text)
language sql
security definer
set search_path = public
as $$
  select invoice_whatsapp, invoice_bank_details, invoice_contact_note
    from public.payment_settings
   where id
$$;
revoke all on function invoice_contact_details() from public, anon;
grant execute on function invoice_contact_details() to authenticated, service_role;

create or replace function save_invoice_contact_details(
  p_whatsapp text, p_bank_details text, p_contact_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change invoice details.' using errcode = '42501';
  end if;
  update public.payment_settings
     set invoice_whatsapp     = nullif(btrim(coalesce(p_whatsapp, '')), ''),
         invoice_bank_details = nullif(btrim(coalesce(p_bank_details, '')), ''),
         invoice_contact_note = nullif(btrim(coalesce(p_contact_note, '')), '')
   where id;
end;
$$;
revoke all on function save_invoice_contact_details(text, text, text) from public, anon;
grant execute on function save_invoice_contact_details(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------
create table if not exists invoice_refunds (
  id                    uuid primary key default gen_random_uuid(),
  invoice_id            uuid not null references invoices (id) on delete cascade,
  amount_gbp            numeric(12, 2) not null check (amount_gbp > 0),
  reason                text not null check (btrim(reason) <> ''),
  method                text not null check (method in ('stripe', 'manual')),
  stripe_credit_note_id text,
  created_by            uuid references profiles (id) on delete set null,
  created_at            timestamptz not null default now()
);
create index if not exists invoice_refunds_invoice_idx on invoice_refunds (invoice_id);

alter table invoice_refunds enable row level security;
create policy "invoice_refunds: admin manage"
  on invoice_refunds for all using (is_admin()) with check (is_admin());
create policy "invoice_refunds: brand read own"
  on invoice_refunds for select
  using (exists (
    select 1 from invoices i join brands b on b.id = i.brand_id
     where i.id = invoice_refunds.invoice_id and b.profile_id = auth.uid()
  ));

alter table invoices add column if not exists refunded_gbp numeric(12, 2) not null default 0;

-- One atomic step: refuses a refund larger than what is left, records it and
-- bumps invoices.refunded_gbp. Called AFTER Stripe accepted a credit note (or
-- for a manual refund), so the ledger never claims money Stripe didn't return.
create or replace function record_invoice_refund(
  p_invoice_id uuid, p_amount numeric, p_reason text, p_method text, p_credit_note_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invoices%rowtype;
  v_left numeric;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can refund an invoice.' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_inv.status <> 'paid' then
    raise exception 'Only a paid invoice can be refunded.';
  end if;
  v_left := v_inv.amount_gbp - v_inv.refunded_gbp;
  if p_amount is null or p_amount <= 0 or p_amount > v_left then
    raise exception 'Refund must be more than £0 and no more than £% (what is left on this invoice).', v_left;
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required.';
  end if;

  insert into public.invoice_refunds (invoice_id, amount_gbp, reason, method, stripe_credit_note_id, created_by)
  values (p_invoice_id, round(p_amount, 2), btrim(p_reason), p_method, p_credit_note_id, auth.uid());

  update public.invoices set refunded_gbp = refunded_gbp + round(p_amount, 2) where id = p_invoice_id;

  return jsonb_build_object('refunded_total', v_inv.refunded_gbp + round(p_amount, 2),
                            'left', v_left - round(p_amount, 2));
end;
$$;
revoke all on function record_invoice_refund(uuid, numeric, text, text, text) from public, anon;
grant execute on function record_invoice_refund(uuid, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: the brand is told about a refund; invoice emails carry the
-- payment details. Templates only change where an admin hasn't edited them.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('invoice.refunded','Invoice refunded','Part or all of a paid invoice was refunded.','brand','The brand','{reference,amount,reason}',453)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('invoice.refunded', 'in_app', 'Refund on invoice {{reference}}',
   'We have refunded {{amount}} on invoice {{reference}}. Reason: {{reason}}'),
  ('invoice.refunded', 'email', 'Refund on invoice {{reference}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'We have refunded {{amount}} on invoice {{reference}}. Reason: {{reason}}' || chr(10) || chr(10) ||
   'Card refunds usually reach your account within 5–10 working days.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;

update notification_events
   set variables = '{reference,amount,due_date,invoice_link,payment_details}'
 where key in ('invoice.sent', 'invoice.reminder');

update notification_templates
   set body = replace(body,
                      'View your invoice: {{invoice_link}}',
                      'View and pay your invoice: {{invoice_link}}' || chr(10) || chr(10) || '{{payment_details}}')
 where event_key in ('invoice.sent', 'invoice.reminder')
   and channel = 'email'
   and body like '%View your invoice: {{invoice_link}}%'
   and body not like '%{{payment_details}}%';
