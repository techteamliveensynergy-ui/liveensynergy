-- =============================================================================
-- 0082 — Artist / Organiser Fulfilment Form (19 Oct standup + "Artist / Event
-- Portal" brief, 20 Oct).
--
-- The brand side of a campaign ends with the Campaign Order Form (0054). This
-- is the artist's counterpart, so the loop closes: brand signs → pays → the
-- team matches the event → the artist completes this form → codes, surveys,
-- event, proofs, payment.
--
-- One form per sponsored event. LES (an admin) pre-fills it — promotional
-- commitments, any special terms, the terms of payment and the deadline for
-- the discount codes (default one week from when it is sent) — and sends it.
-- The artist then sees, in order:
--   1. their details (live from their profile) and the event (live from the
--      listing) — read-only, nothing copied that could drift;
--   2. the reward engine / discount codes, confirmed with confirm_reward_codes()
--      as before plus one more consent: "LES will be informed promptly of any
--      redemption problems, restrictions or changes affecting the codes";
--   3. the promotional commitments, with two confirmations;
--   4. any other special terms;
--   5. proof of the social-media terms (sponsored_event_proofs, after the fact);
--   6. the terms of payment, their payment details and invoice uploads;
--   7. the final "I/We agree to the Terms & Conditions and Privacy Policy".
--
-- The artist has NO update policy on the form — its commercial terms are what
-- they are agreeing to (same reasoning as campaign_order_forms). Their three
-- writes are definer functions below. The brand cannot read the form at all:
-- it holds the artist's payment details.
--
-- Additive only: two new tables, new functions, wider check constraints on
-- consent_records. confirm_reward_codes() gains an optional argument; called
-- the old way (no argument) it behaves exactly as before, so code deployed
-- before or after this migration keeps working.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
create table if not exists public.artist_fulfilment_forms (
  id                        uuid primary key default gen_random_uuid(),
  sponsored_event_id        uuid not null unique references public.sponsored_events (id) on delete cascade,
  status                    text not null default 'draft'
                              check (status in ('draft', 'sent', 'changes_requested', 'submitted')),

  -- Discount codes: set up and confirmed by this date (brief: "1 week from
  -- form creation"; the send action fills it in when left blank).
  codes_deadline            date,

  -- Promotional commitments (pre-filled by LES). promo_channels holds keys
  -- from PROMO_CHANNELS in src/lib/fulfilment-forms.ts; promo_channels_custom
  -- the "other agreed channel" names typed in by hand.
  promo_channels            text[] not null default '{}',
  promo_channels_custom     text[] not null default '{}',
  promo_post_count          int check (promo_post_count is null or promo_post_count between 0 and 1000),
  promo_start_date          date,
  promo_social_handles      text,
  promo_post_texts          text,
  promo_other_requirements  text,

  special_terms             text,
  payment_terms             text,

  -- The artist's side.
  payment_details           text,
  consent_publish           boolean not null default false,
  consent_materials         boolean not null default false,
  consent_terms_privacy     boolean not null default false,
  terms_version             text,

  sent_at                   timestamptz,
  sent_by                   uuid references public.profiles (id) on delete set null,
  changes_requested_at      timestamptz,
  changes_requested_note    text,
  submitted_at              timestamptz,
  submitted_by              uuid references public.profiles (id) on delete set null,
  created_by                uuid references public.profiles (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

drop trigger if exists artist_fulfilment_forms_set_updated_at on public.artist_fulfilment_forms;
create trigger artist_fulfilment_forms_set_updated_at before update on public.artist_fulfilment_forms
  for each row execute function set_updated_at();

create table if not exists public.artist_fulfilment_invoices (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.artist_fulfilment_forms (id) on delete cascade,
  -- private-uploads path, {uploader}/fulfilment-invoice/{uuid}.{ext}
  file_path    text not null,
  file_name    text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists artist_fulfilment_invoices_form_idx on public.artist_fulfilment_invoices (form_id);

-- 2 --- RLS -------------------------------------------------------------------
-- Policy helper: definer so a policy here doesn't recurse through
-- sponsored_events' own RLS.
create or replace function public.is_my_fulfilment_form(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from artist_fulfilment_forms f
      join sponsored_events se on se.id = f.sponsored_event_id
     where f.id = p_form_id
       and f.status <> 'draft'
       and se.artist_profile_id = auth.uid()
  );
$$;
revoke all on function public.is_my_fulfilment_form(uuid) from public, anon;
grant execute on function public.is_my_fulfilment_form(uuid) to authenticated;

alter table public.artist_fulfilment_forms enable row level security;
alter table public.artist_fulfilment_invoices enable row level security;

drop policy if exists "artist_fulfilment_forms: admin all" on public.artist_fulfilment_forms;
create policy "artist_fulfilment_forms: admin all" on public.artist_fulfilment_forms
  for all using (public.is_admin()) with check (public.is_admin());

-- The artist reads their own form once it has been sent; a draft is the
-- team's work in progress.
drop policy if exists "artist_fulfilment_forms: artist read" on public.artist_fulfilment_forms;
create policy "artist_fulfilment_forms: artist read" on public.artist_fulfilment_forms
  for select using (public.is_my_fulfilment_form(id));

drop policy if exists "artist_fulfilment_invoices: admin all" on public.artist_fulfilment_invoices;
create policy "artist_fulfilment_invoices: admin all" on public.artist_fulfilment_invoices
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "artist_fulfilment_invoices: artist read" on public.artist_fulfilment_invoices;
create policy "artist_fulfilment_invoices: artist read" on public.artist_fulfilment_invoices
  for select using (public.is_my_fulfilment_form(form_id));

-- Insert only into their own storage namespace (the object itself is guarded
-- by the private-uploads policies from 0009) and only as themselves.
drop policy if exists "artist_fulfilment_invoices: artist insert" on public.artist_fulfilment_invoices;
create policy "artist_fulfilment_invoices: artist insert" on public.artist_fulfilment_invoices
  for insert with check (
    public.is_my_fulfilment_form(form_id)
    and uploaded_by = auth.uid()
    and split_part(file_path, '/', 1) = auth.uid()::text
  );

drop policy if exists "artist_fulfilment_invoices: artist delete own" on public.artist_fulfilment_invoices;
create policy "artist_fulfilment_invoices: artist delete own" on public.artist_fulfilment_invoices
  for delete using (public.is_my_fulfilment_form(form_id) and uploaded_by = auth.uid());

-- 3 --- Artist actions (definer; the artist has no UPDATE policy) -------------
create or replace function public.submit_artist_fulfilment_form(
  p_form_id uuid,
  p_publish boolean,
  p_materials boolean,
  p_terms_privacy boolean,
  p_payment_details text,
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form artist_fulfilment_forms%rowtype;
  v_event sponsored_events%rowtype;
begin
  select * into v_form from artist_fulfilment_forms where id = p_form_id for update;
  if not found then
    raise exception 'Fulfilment form not found.';
  end if;
  select * into v_event from sponsored_events where id = v_form.sponsored_event_id;
  if v_event.artist_profile_id is distinct from auth.uid() then
    raise exception 'Only the artist or organiser on this event can complete its fulfilment form.' using errcode = '42501';
  end if;
  if v_form.status = 'submitted' then
    return jsonb_build_object('already', true);
  end if;
  if v_form.status <> 'sent' then
    raise exception 'This form is not waiting for you right now — the team is updating it.';
  end if;
  if v_event.status = 'withdrawn' then
    raise exception 'This sponsorship was withdrawn, so its fulfilment form is closed.';
  end if;
  if not coalesce(p_publish, false) or not coalesce(p_materials, false) or not coalesce(p_terms_privacy, false) then
    raise exception 'Please tick every confirmation to submit.';
  end if;

  update artist_fulfilment_forms
     set status = 'submitted',
         submitted_at = now(),
         submitted_by = auth.uid(),
         consent_publish = true,
         consent_materials = true,
         consent_terms_privacy = true,
         terms_version = left(nullif(btrim(coalesce(p_terms_version, '')), ''), 40),
         payment_details = coalesce(left(nullif(btrim(coalesce(p_payment_details, '')), ''), 2000), payment_details)
   where id = p_form_id;

  return jsonb_build_object('already', false);
end;
$$;
revoke all on function public.submit_artist_fulfilment_form(uuid, boolean, boolean, boolean, text, text) from public, anon;
grant execute on function public.submit_artist_fulfilment_form(uuid, boolean, boolean, boolean, text, text) to authenticated;

create or replace function public.request_artist_fulfilment_changes(p_form_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form artist_fulfilment_forms%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  select * into v_form from artist_fulfilment_forms where id = p_form_id for update;
  if not found then
    raise exception 'Fulfilment form not found.';
  end if;
  if not exists (
    select 1 from sponsored_events se
     where se.id = v_form.sponsored_event_id and se.artist_profile_id = auth.uid()
  ) then
    raise exception 'Only the artist or organiser on this event can request changes.' using errcode = '42501';
  end if;
  if v_form.status <> 'sent' then
    raise exception 'This form is not waiting for you right now.';
  end if;
  if v_note = '' then
    raise exception 'Tell us what you would like changed.';
  end if;

  update artist_fulfilment_forms
     set status = 'changes_requested',
         changes_requested_at = now(),
         changes_requested_note = left(v_note, 2000)
   where id = p_form_id;
end;
$$;
revoke all on function public.request_artist_fulfilment_changes(uuid, text) from public, anon;
grant execute on function public.request_artist_fulfilment_changes(uuid, text) to authenticated;

-- Payment details may change after submitting (new bank account), so this is
-- open in any non-draft status. Touches that one column only.
create or replace function public.save_artist_fulfilment_payment_details(p_form_id uuid, p_details text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_my_fulfilment_form(p_form_id) then
    raise exception 'Only the artist or organiser on this event can update its payment details.' using errcode = '42501';
  end if;
  update artist_fulfilment_forms
     set payment_details = left(nullif(btrim(coalesce(p_details, '')), ''), 2000)
   where id = p_form_id;
end;
$$;
revoke all on function public.save_artist_fulfilment_payment_details(uuid, text) from public, anon;
grant execute on function public.save_artist_fulfilment_payment_details(uuid, text) to authenticated;

-- 4 --- Consent log (0080) ----------------------------------------------------
alter table public.consent_records drop constraint if exists consent_records_consent_type_check;
alter table public.consent_records add constraint consent_records_consent_type_check check (consent_type in (
  'platform_terms', 'privacy_policy', 'email_verified', 'event_terms', 'sponsor_marketing',
  'survey_terms', 'residency_confirmed', 'order_form_details', 'order_form_terms',
  'reward_codes_confirmed',   -- artist confirmed the discount-code setup (0045)
  'reward_codes_notice',      -- "LES will be informed promptly of any redemption problems…"
  'fulfilment_publish',       -- will publish the agreed communications on the agreed schedule
  'fulfilment_materials',     -- will use the campaign link and LES-approved materials
  'fulfilment_terms'          -- fulfilment form: Terms & Conditions and Privacy Policy
));

alter table public.consent_records drop constraint if exists consent_records_source_check;
alter table public.consent_records add constraint consent_records_source_check check (source in (
  'sign_up', 'survey_sign_up', 'verify_link', 'event_registration',
  'my_events', 'public_survey', 'dashboard_survey', 'order_form',
  'discount_codes', 'fulfilment_form'
));

create or replace function public.consent_from_fulfilment_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_ctx jsonb;
begin
  begin
    select p.email into v_email from profiles p where p.id = new.submitted_by;
    select jsonb_build_object('fulfilment_form_id', new.id, 'sponsored_event_id', se.id,
                              'event_reference', se.reference, 'event_name', se.name)
      into v_ctx
      from sponsored_events se where se.id = new.sponsored_event_id;
    insert into consent_records (profile_id, subject_email, consent_type, granted, version, source, context, recorded_at)
    values
      (new.submitted_by, v_email, 'fulfilment_publish', new.consent_publish, null, 'fulfilment_form', v_ctx, coalesce(new.submitted_at, now())),
      (new.submitted_by, v_email, 'fulfilment_materials', new.consent_materials, null, 'fulfilment_form', v_ctx, coalesce(new.submitted_at, now())),
      (new.submitted_by, v_email, 'fulfilment_terms', new.consent_terms_privacy, new.terms_version, 'fulfilment_form', v_ctx, coalesce(new.submitted_at, now()));
  exception when others then
    raise warning 'consent_from_fulfilment_form (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists artist_fulfilment_forms_consent_records on public.artist_fulfilment_forms;
create trigger artist_fulfilment_forms_consent_records
  after update of status on public.artist_fulfilment_forms
  for each row
  when (new.status = 'submitted' and old.status is distinct from 'submitted')
  execute function public.consent_from_fulfilment_form();

-- 5 --- Discount codes: the extra consent ------------------------------------
-- Same checks as 0045, plus p_redemption_notice. Passing false refuses; the
-- app always passes true/false. Leaving it out (code deployed before this
-- migration) keeps the old behaviour, so the two can ship in either order.
-- Both consents are logged in consent_records here — the codes confirmation
-- was not logged anywhere but sponsored_events before.
drop function if exists public.confirm_reward_codes(uuid);
create or replace function public.confirm_reward_codes(p_event_id uuid, p_redemption_notice boolean default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event sponsored_events%rowtype;
  v_tier  record;
  v_pool  int;
  v_email text;
  v_ctx   jsonb;
begin
  select * into v_event from sponsored_events where id = p_event_id for update;
  if not found or v_event.artist_profile_id is distinct from auth.uid() then
    return 'forbidden';
  end if;
  if v_event.reward_codes_confirmed_at is not null then
    return 'already_confirmed';
  end if;
  if p_redemption_notice is not null and not p_redemption_notice then
    return 'notice_required';
  end if;
  if not exists (select 1 from sponsored_event_reward_tiers where sponsored_event_id = p_event_id) then
    return 'no_tiers';
  end if;

  for v_tier in
    select * from sponsored_event_reward_tiers where sponsored_event_id = p_event_id
  loop
    if v_tier.distribution_model = 'shared' and v_tier.shared_code is null then
      return 'shared_code_missing';
    end if;
    if v_tier.distribution_model = 'unique' then
      select count(*) into v_pool from reward_code_pool where tier_id = v_tier.id;
      if v_pool = 0 then
        return 'pool_empty';
      end if;
    end if;
  end loop;

  update sponsored_events
     set reward_codes_confirmed_at = now(),
         reward_codes_confirmed_by = auth.uid()
   where id = p_event_id;

  begin
    select email into v_email from profiles where id = auth.uid();
    v_ctx := jsonb_build_object('sponsored_event_id', v_event.id,
                                'event_reference', v_event.reference, 'event_name', v_event.name);
    insert into consent_records (profile_id, subject_email, consent_type, granted, source, context)
    values (auth.uid(), v_email, 'reward_codes_confirmed', true, 'discount_codes', v_ctx);
    if p_redemption_notice then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, context)
      values (auth.uid(), v_email, 'reward_codes_notice', true, 'discount_codes', v_ctx);
    end if;
  exception when others then
    raise warning 'confirm_reward_codes consent log (%): %', p_event_id, sqlerrm;
  end;

  return 'confirmed';
end;
$$;
revoke all on function public.confirm_reward_codes(uuid, boolean) from public, anon;
grant execute on function public.confirm_reward_codes(uuid, boolean) to authenticated;

-- 6 --- Notifications (three-step insert — notify() no-ops on an unseeded key)
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('fulfilment.sent', 'Fulfilment form ready',
   'The team has prepared the fulfilment form for your sponsored event — review the commitments and complete it.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference,codes_deadline,form_link}', 441),
  ('admin.fulfilment_submitted', 'Fulfilment form submitted',
   'An artist or organiser completed the fulfilment form for a sponsored event.',
   'admin', 'All admins', '{event_name,reference,artist_name}', 946),
  ('admin.fulfilment_changes_requested', 'Fulfilment form changes requested',
   'An artist or organiser asked for changes to their fulfilment form.',
   'admin', 'All admins', '{event_name,reference,artist_name,note}', 947),
  ('admin.fulfilment_invoice_uploaded', 'Artist invoice uploaded',
   'An artist or organiser uploaded an invoice on their fulfilment form.',
   'admin', 'All admins', '{event_name,reference,artist_name}', 948)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('fulfilment.sent', 'in_app', 'Your fulfilment form is ready',
   'Please review and complete the fulfilment form for {{event_name}} ({{reference}}). Discount codes are due by {{codes_deadline}}.'),
  ('fulfilment.sent', 'email', 'Your fulfilment form for {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'The Live·En·Synergy team has prepared the fulfilment form for {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
   'It sets out the discount codes, the promotional commitments and the terms of payment. Please review it, confirm the codes by {{codes_deadline}}, and submit the form:' || chr(10) || chr(10) ||
   '{{form_link}}' || chr(10) || chr(10) ||
   'Anything that doesn''t look right? Use "Request changes" on the form and we''ll update it.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.fulfilment_submitted', 'in_app', 'Fulfilment form submitted',
   '{{artist_name}} submitted the fulfilment form for {{event_name}} ({{reference}}).'),
  ('admin.fulfilment_submitted', 'email', 'Fulfilment form submitted — {{reference}}',
   '{{artist_name}} submitted the fulfilment form for {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
   'Open the sponsored event in the admin portal to review it.'),
  ('admin.fulfilment_changes_requested', 'in_app', 'Fulfilment form changes requested',
   '{{artist_name}} asked for changes to the fulfilment form for {{event_name}} ({{reference}}): {{note}}'),
  ('admin.fulfilment_changes_requested', 'email', 'Fulfilment form changes requested — {{reference}}',
   '{{artist_name}} asked for changes to the fulfilment form for {{event_name}} ({{reference}}):' || chr(10) || chr(10) ||
   '{{note}}' || chr(10) || chr(10) ||
   'Update the form in the admin portal and send it again.'),
  ('admin.fulfilment_invoice_uploaded', 'in_app', 'Artist invoice uploaded',
   '{{artist_name}} uploaded an invoice for {{event_name}} ({{reference}}).'),
  ('admin.fulfilment_invoice_uploaded', 'email', 'Artist invoice uploaded — {{reference}}',
   '{{artist_name}} uploaded an invoice for {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
   'Open the sponsored event in the admin portal to view it.')
on conflict do nothing;
