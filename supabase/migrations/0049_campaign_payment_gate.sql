-- =============================================================================
-- Live-En-Synergy — the campaign payment gate (Phase B).
-- Requires 0048 (adds the 'awaiting_payment' value) to have been applied FIRST,
-- in its own run.
--
-- An admin-created campaign starts 'awaiting_payment'. It reaches artists
-- ('in_progress') only through one of two admin-only, atomic functions below:
-- the invoice being marked paid, or an explicit, reasoned waiver.
--
-- Existing campaigns are untouched — they stay 'in_progress'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Audit columns
-- ---------------------------------------------------------------------------
alter table campaigns
  add column if not exists payment_waived_at     timestamptz,
  add column if not exists payment_waived_by     uuid references profiles (id) on delete set null,
  add column if not exists payment_waived_reason text;

alter table invoices
  add column if not exists paid_source text check (paid_source in ('manual', 'stripe')),
  add column if not exists paid_by     uuid references profiles (id) on delete set null;

-- Semantic backfill (L4): every invoice marked paid before now was marked by an
-- admin by hand — there was no other way. Record that rather than leave it null.
update invoices set paid_source = 'manual' where status = 'paid' and paid_source is null;

-- ---------------------------------------------------------------------------
-- SECURITY (L4 / L3c): a brand could update ANY column of its own campaign row.
-- The 0025 update policy let the brand owner write status, budget_gbp and
-- package_platform_margin_gbp straight through the Supabase client — which
-- would let a brand flip its own awaiting_payment campaign to in_progress and
-- skip the gate. Nothing in the app does this (campaigns are admin-managed
-- since 0025; the brand edit screen writes campaign_intake_requests, and
-- agreeing/closing run through security-definer functions), so update is now
-- admin-only. Brands keep read access.
-- ---------------------------------------------------------------------------
drop policy if exists "campaigns: brand owner or admin update" on campaigns;
create policy "campaigns: admin update"
  on campaigns for update
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- open_campaigns (0025) already filters `where c.status = 'in_progress'`, so an
-- awaiting_payment campaign is invisible to artists with no view change. The
-- paths below are the ones that DON'T go through that view.
-- ---------------------------------------------------------------------------

-- Nobody may stand up a sponsorship against a campaign still awaiting payment:
-- not a brand proposing against its own campaign (which reads `campaigns`
-- directly, not the view), not an admin matching it. Enforced here, in the
-- database, as the backstop — security definer so a brand/artist inserting can
-- see the campaign's status past RLS.
create or replace function sponsored_event_requires_open_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.campaign_id is not null and exists (
    select 1 from public.campaigns c
     where c.id = new.campaign_id and c.status = 'awaiting_payment'
  ) then
    raise exception
      'This campaign is awaiting payment, so it cannot be matched or proposed against yet.';
  end if;
  return new;
end;
$$;

drop trigger if exists sponsored_events_require_open_campaign on sponsored_events;
create trigger sponsored_events_require_open_campaign
  before insert on sponsored_events
  for each row execute function sponsored_event_requires_open_campaign();

-- ---------------------------------------------------------------------------
-- mark_invoice_paid — the ONE place an invoice becomes paid (the Stripe webhook
-- will call the same logic later). Atomic: locks the invoice, marks it paid and,
-- for a campaign's package invoice, opens the campaign in the same transaction —
-- so a crash or a double-click can't leave "paid but still hidden" or open a
-- campaign twice. Admin-only (checked inside; EXECUTE is granted to
-- authenticated because the check, not the grant, is the gate).
-- Returns {opened, campaign_id} so the caller knows whether to tell the brand.
-- ---------------------------------------------------------------------------
create or replace function mark_invoice_paid(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv    public.invoices%rowtype;
  v_opened boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can mark an invoice paid.' using errcode = '42501';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_inv.status not in ('sent', 'overdue') then
    raise exception 'Only a sent or overdue invoice can be marked paid (this one is %).', v_inv.status;
  end if;

  update public.invoices
     set status = 'paid', paid_at = now(), paid_source = 'manual', paid_by = auth.uid()
   where id = p_invoice_id;

  if v_inv.kind = 'campaign_package' and v_inv.campaign_id is not null then
    update public.campaigns
       set status = 'in_progress'
     where id = v_inv.campaign_id and status = 'awaiting_payment';
    v_opened := found;
  end if;

  return jsonb_build_object('opened', v_opened, 'campaign_id', v_inv.campaign_id);
end;
$$;

revoke all on function mark_invoice_paid(uuid) from public, anon;
grant execute on function mark_invoice_paid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- waive_campaign_payment — open an awaiting_payment campaign WITHOUT payment
-- (a comp or internal campaign). Needs a written reason, records who and when,
-- and cancels the campaign's live package invoice so nothing is left dangling.
-- ---------------------------------------------------------------------------
create or replace function waive_campaign_payment(p_campaign_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.campaign_status;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Only an admin can waive payment.' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception 'A reason is required to waive payment.';
  end if;

  select status into v_status from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign not found.';
  end if;
  if v_status <> 'awaiting_payment' then
    raise exception 'This campaign is not awaiting payment.';
  end if;

  update public.invoices
     set status = 'cancelled'
   where campaign_id = p_campaign_id
     and kind = 'campaign_package'
     and status in ('draft', 'sent', 'overdue');

  update public.campaigns
     set status = 'in_progress',
         payment_waived_at = now(),
         payment_waived_by = auth.uid(),
         payment_waived_reason = v_reason
   where id = p_campaign_id;

  return jsonb_build_object('opened', true, 'campaign_id', p_campaign_id);
end;
$$;

revoke all on function waive_campaign_payment(uuid, text) from public, anon;
grant execute on function waive_campaign_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification: the brand is told when their campaign opens (paid or waived).
-- Same three-step insert as 0006/0031/0047 — notify() no-ops on an unseeded key.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('campaign.opened','Campaign live','Your campaign is now open to artists and event organisers.','brand','The brand','{campaign_reference}',448)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('campaign.opened', 'in_app', 'Your campaign is live',
   'Campaign {{campaign_reference}} is now open to artists and event organisers.'),
  ('campaign.opened', 'email', 'Your campaign is live · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Campaign {{campaign_reference}} is now open to artists and event organisers. Our team will be in touch as we line up events for you.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
