-- =============================================================================
-- Live-En-Synergy — brand billing details + auto-drafted invoices
-- (docs/payments-email-implementation-plan.md, Phase B first slice).
--
-- Creating a campaign now drafts a VAT-itemised invoice for an admin to review
-- and send. That needs (a) somewhere for a brand to record who to invoice,
-- (b) line items + a VAT breakdown on the invoice, and (c) brands to stop
-- seeing invoices an admin hasn't reviewed yet.
--
-- No Stripe, no payment gate — the campaign lifecycle is unchanged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Brand billing details. All nullable: nothing is mandatory at sign-up, the
-- admin "Send invoice" step refuses until the required ones are present.
-- `brands` is readable only by its owner and admins (0002), and
-- public_brand_profiles lists its columns explicitly (0016), so none of this
-- is exposed publicly — no view change needed.
-- ---------------------------------------------------------------------------
alter table brands
  add column if not exists billing_legal_name    text,
  add column if not exists billing_email         text,
  add column if not exists billing_address_line1 text,
  add column if not exists billing_address_line2 text,
  add column if not exists billing_city          text,
  add column if not exists billing_postcode      text,
  add column if not exists billing_country       text,
  add column if not exists vat_number            text;

-- ---------------------------------------------------------------------------
-- Invoices: kind, line items, VAT breakdown, billing snapshot.
--   kind     'manual' = the existing typed-amount invoice (ad hoc / top-ups);
--            'campaign_package' = auto-drafted from a campaign.
--   lines    jsonb array stored on the invoice row, so the invoice and its
--            lines are written atomically in one insert and are a frozen
--            snapshot — later package edits can't rewrite an issued invoice.
--   amount_gbp stays the GROSS total (what the brand pays).
--   billing_snapshot  the brand's billing details as at send time.
-- ---------------------------------------------------------------------------
alter table invoices
  add column if not exists kind text not null default 'manual'
    check (kind in ('manual', 'campaign_package')),
  add column if not exists lines            jsonb,
  add column if not exists subtotal_gbp     numeric(12, 2),
  add column if not exists vat_gbp          numeric(12, 2),
  add column if not exists billing_snapshot jsonb;

-- Itemised invoices must add up. Pre-existing manual rows have both columns
-- null and are exempt.
alter table invoices
  add constraint invoices_amount_matches_breakdown check (
    (subtotal_gbp is null and vat_gbp is null)
    or (subtotal_gbp is not null and vat_gbp is not null
        and amount_gbp = subtotal_gbp + vat_gbp)
  );

-- At most one live auto-drafted invoice per campaign (a double-submit or a
-- repair click can't create a second). Cancelled invoices don't count, which
-- is what lets an admin cancel and re-draft. Existing rows are all 'manual',
-- so this can't fail on current data.
create unique index if not exists invoices_one_live_campaign_package_idx
  on invoices (campaign_id)
  where kind = 'campaign_package' and status in ('draft', 'sent', 'overdue');

-- ---------------------------------------------------------------------------
-- SEMANTIC CHANGE (L4): brands could read their own DRAFT invoices (0031's
-- policy had no status filter). Now that drafts are created automatically for
-- an admin to review, a brand must not see one until it is sent — otherwise a
-- wrong package price reaches the brand before anyone has looked at it.
-- ---------------------------------------------------------------------------
drop policy if exists "invoices: brand owner or admin read" on invoices;
create policy "invoices: brand owner or admin read"
  on invoices for select
  using (
    is_admin()
    or (
      status <> 'draft'
      and exists (
        select 1 from brands b
        where b.id = invoices.brand_id and b.profile_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Notifications. Same three-step insert as 0006/0031 (notify() no-ops on an
-- unseeded key).
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('brand.billing_details_needed','Billing details needed','We started an invoice but need the brand''s billing details first.','brand','The brand','{campaign_reference}',447)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('brand.billing_details_needed', 'in_app', 'Add your billing details',
   'We''ve started an invoice for campaign {{campaign_reference}} but need your billing details first. Add them in your profile so we can send it.'),
  ('brand.billing_details_needed', 'email', 'Add your billing details · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'We''ve started an invoice for campaign {{campaign_reference}} but need your billing details first (legal company name, billing email, address and VAT number if you have one). Please add them in your profile so we can send it.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;

-- invoice.sent now carries a link and a due date. Phase A means this email is
-- really sent, so the starter text ("An invoice was sent…") is replaced — but
-- only where an admin hasn't already edited it.
update notification_events
   set variables = '{reference,amount,due_date,invoice_link}',
       description = 'An invoice is ready for your sponsorship.'
 where key = 'invoice.sent';

update notification_templates
   set body = 'Hi {{user_name}},' || chr(10) || chr(10) ||
              'Invoice {{reference}} for {{amount}} (including VAT) is ready. Please pay by {{due_date}}, quoting the invoice reference.' || chr(10) || chr(10) ||
              'View your invoice: {{invoice_link}}' || chr(10) || chr(10) ||
              '— The Live·En·Synergy team'
 where event_key = 'invoice.sent'
   and channel = 'email'
   and body = 'Hi {{user_name}},' || chr(10) || chr(10) ||
              'An invoice was sent for your sponsorship.' || chr(10) || chr(10) ||
              '— The Live·En·Synergy team';
