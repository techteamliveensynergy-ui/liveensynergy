-- =============================================================================
-- Live-En-Synergy — Campaign Order Form (GitHub #9, docs: Admin Portal brief,
-- 1 & 5 Oct standups).
--
-- While volume is low every campaign is set up by an admin after a 1-on-1 with
-- the brand. The admin fills a Campaign Order Form (brand, campaign, linked
-- event, research, participant benefit, social media, commercial terms), sends
-- it to the brand, and the brand approves it with two consents. Approval moves
-- the campaign on to billing: its invoice is (re)built from the form's
-- commercial figures and sent.
--
-- Who sees what:
--   admin   — everything (RLS: is_admin()).
--   brand   — its own forms once sent (never a draft). It can't UPDATE the row
--             at all; approve / request changes go through the two definer
--             functions below, which only touch the workflow columns.
--   artist  — the linked artist sees the "ok for artist to see" sections only,
--             through the campaign_order_briefs view (no brand address /
--             contact person / commercial terms), once the brand has approved.
-- =============================================================================

create sequence if not exists campaign_order_forms_reference_seq;

create table if not exists campaign_order_forms (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique
                       default ('COF-' || lpad(nextval('campaign_order_forms_reference_seq')::text, 5, '0')),
  campaign_id        uuid not null unique references campaigns (id) on delete cascade,
  brand_id           uuid not null references brands (id) on delete cascade,
  status             text not null default 'draft'
                       check (status in ('draft', 'sent', 'changes_requested', 'approved')),

  -- Brand / company (autopopulated from the brand, editable)
  brand_company_name text,
  brand_address      text,
  contact_name       text,
  contact_email      text,

  -- Campaign information (ok for artist to see)
  campaign_name      text,
  campaign_objective text,
  campaign_timeline  text,

  -- Linked event (ok for artist to see)
  listing_id         uuid references event_listings (id) on delete set null,
  artist_profile_id  uuid references profiles (id) on delete set null,
  artist_name        text,
  event_name         text,
  event_reference    text,
  event_date         date,
  event_venue        text,
  event_location     text,

  -- Research
  approx_participants   int check (approx_participants is null or approx_participants > 0),
  survey_type           text check (survey_type in ('pre', 'post', 'pre_post')),
  survey_question_count int check (survey_question_count is null or survey_question_count >= 0),
  research_questions    text,
  draft_survey_link     text,

  -- Participant benefit (ok for artist to see)
  discount_reward          text,
  rewards_available        int check (rewards_available is null or rewards_available >= 0),
  redemption_arrangements  text,

  -- Artist social media for survey participation (ok for artist to see)
  social_media_details text,

  other_details text,

  -- Large imagery / video shown to the brand on the review screen (5 Oct)
  media_image_urls text[] not null default '{}',
  media_video_url  text,

  -- Commercial (entered separately — Enterprise pricing is custom)
  campaign_package_id uuid references campaign_packages (id) on delete set null,
  campaign_fee_gbp    numeric(12, 2) check (campaign_fee_gbp is null or campaign_fee_gbp > 0),
  vat_gbp             numeric(12, 2) check (vat_gbp is null or vat_gbp >= 0),
  total_gbp           numeric(12, 2),
  payment_date        date,

  -- Workflow
  sent_at                 timestamptz,
  sent_by                 uuid references profiles (id) on delete set null,
  changes_requested_at    timestamptz,
  changes_requested_note  text,
  approved_at             timestamptz,
  approved_by             uuid references profiles (id) on delete set null,
  consent_details_approved boolean not null default false,
  consent_terms_accepted   boolean not null default false,

  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint campaign_order_forms_total_matches check (
    total_gbp is null or campaign_fee_gbp is null or vat_gbp is null
    or total_gbp = campaign_fee_gbp + vat_gbp
  ),
  constraint campaign_order_forms_approved_has_consents check (
    status <> 'approved' or (consent_details_approved and consent_terms_accepted and approved_at is not null)
  )
);

create index if not exists campaign_order_forms_brand_idx on campaign_order_forms (brand_id);
create index if not exists campaign_order_forms_artist_idx on campaign_order_forms (artist_profile_id);

create trigger campaign_order_forms_set_updated_at before update on campaign_order_forms
  for each row execute function set_updated_at();

alter table campaign_order_forms enable row level security;

create policy "campaign_order_forms: admin manage"
  on campaign_order_forms for all
  using (is_admin()) with check (is_admin());

-- A brand reads its own form once it has been sent — never an admin's draft.
create policy "campaign_order_forms: brand read sent"
  on campaign_order_forms for select
  using (
    status <> 'draft'
    and exists (
      select 1 from brands b
       where b.id = campaign_order_forms.brand_id and b.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Artist-facing brief: only the sections the Admin Portal brief marks "ok for
-- artist to see", only for the linked artist, only once the brand approved.
-- A view because RLS can't hide columns (same technique as public_*_profiles).
-- ---------------------------------------------------------------------------
create or replace view campaign_order_briefs as
  select f.id,
         f.reference,
         c.reference        as campaign_reference,
         f.campaign_name,
         f.campaign_objective,
         f.campaign_timeline,
         f.artist_name,
         f.event_name,
         f.event_reference,
         f.event_date,
         f.event_venue,
         f.event_location,
         f.approx_participants,
         f.discount_reward,
         f.rewards_available,
         f.redemption_arrangements,
         f.social_media_details,
         b.brand_name,
         f.approved_at
    from campaign_order_forms f
    join campaigns c on c.id = f.campaign_id
    join brands b on b.id = f.brand_id
   where f.status = 'approved'
     and (f.artist_profile_id = auth.uid() or is_admin());

grant select on campaign_order_briefs to authenticated;

-- ---------------------------------------------------------------------------
-- Brand actions. security definer so the brand never needs an UPDATE policy
-- on the row (which would let it rewrite the commercial terms it is approving).
-- ---------------------------------------------------------------------------
create or replace function approve_campaign_order_form(
  p_form_id uuid, p_details_approved boolean, p_terms_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.campaign_order_forms%rowtype;
begin
  select * into v_form from public.campaign_order_forms where id = p_form_id for update;
  if not found then
    raise exception 'Order form not found.';
  end if;
  if not exists (
    select 1 from public.brands b where b.id = v_form.brand_id and b.profile_id = auth.uid()
  ) then
    raise exception 'Only the brand this order form is for can approve it.' using errcode = '42501';
  end if;
  if v_form.status = 'approved' then
    return jsonb_build_object('already', true, 'campaign_id', v_form.campaign_id);
  end if;
  if v_form.status <> 'sent' then
    raise exception 'This order form is not waiting for your approval.';
  end if;
  if not coalesce(p_details_approved, false) or not coalesce(p_terms_accepted, false) then
    raise exception 'Please tick both boxes to approve.';
  end if;

  update public.campaign_order_forms
     set status = 'approved',
         approved_at = now(),
         approved_by = auth.uid(),
         consent_details_approved = true,
         consent_terms_accepted = true
   where id = p_form_id;

  return jsonb_build_object('already', false, 'campaign_id', v_form.campaign_id);
end;
$$;
revoke all on function approve_campaign_order_form(uuid, boolean, boolean) from public, anon;
grant execute on function approve_campaign_order_form(uuid, boolean, boolean) to authenticated;

create or replace function request_campaign_order_form_changes(p_form_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.campaign_order_forms%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  select * into v_form from public.campaign_order_forms where id = p_form_id for update;
  if not found then
    raise exception 'Order form not found.';
  end if;
  if not exists (
    select 1 from public.brands b where b.id = v_form.brand_id and b.profile_id = auth.uid()
  ) then
    raise exception 'Only the brand this order form is for can request changes.' using errcode = '42501';
  end if;
  if v_form.status <> 'sent' then
    raise exception 'This order form is not waiting for your approval.';
  end if;
  if v_note = '' then
    raise exception 'Tell us what you would like changed.';
  end if;

  update public.campaign_order_forms
     set status = 'changes_requested',
         changes_requested_at = now(),
         changes_requested_note = left(v_note, 2000)
   where id = p_form_id;
end;
$$;
revoke all on function request_campaign_order_form_changes(uuid, text) from public, anon;
grant execute on function request_campaign_order_form_changes(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications (three-step insert — notify() no-ops on an unseeded key).
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('order_form.sent','Order form ready to review','A campaign order form is waiting for the brand''s approval.','brand','The brand','{reference,campaign_reference,order_form_link}',452),
  ('admin.order_form_approved','Order form approved','A brand approved its campaign order form.','admin','All admins','{reference,campaign_reference,brand_name,invoice_status}',944),
  ('admin.order_form_changes_requested','Order form changes requested','A brand asked for changes to its campaign order form.','admin','All admins','{reference,campaign_reference,brand_name,note}',945)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('order_form.sent', 'in_app', 'Your campaign order form is ready',
   'Order form {{reference}} for campaign {{campaign_reference}} is ready for you to review and approve.'),
  ('order_form.sent', 'email', 'Your campaign order form is ready · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Your campaign order form {{reference}} (campaign {{campaign_reference}}) is ready. Please review the details and approve it so we can start your campaign.' || chr(10) || chr(10) ||
   'Review it here: {{order_form_link}}' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.order_form_approved', 'in_app', 'Order form {{reference}} approved',
   '{{brand_name}} approved order form {{reference}} (campaign {{campaign_reference}}). Invoice: {{invoice_status}}.'),
  ('admin.order_form_approved', 'email', 'Order form {{reference}} approved · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{brand_name}} approved order form {{reference}} for campaign {{campaign_reference}}. Invoice: {{invoice_status}}.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.order_form_changes_requested', 'in_app', 'Changes requested on {{reference}}',
   '{{brand_name}} asked for changes to order form {{reference}}: {{note}}'),
  ('admin.order_form_changes_requested', 'email', 'Changes requested on {{reference}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{brand_name}} asked for changes to order form {{reference}} (campaign {{campaign_reference}}):' || chr(10) || chr(10) ||
   '{{note}}' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
