-- =============================================================================
-- 0104 — the Artist/Organiser Fulfilment Form, filled in by the team.
--
-- Client spec "Artist / Event Portal": the artist's partnership page carries a
-- fulfilment form whose promotional commitments and special terms are
-- pre-filled by Live·En·Synergy and read-only for the artist. The artist's own
-- part is to review it, confirm the discount codes (0045) and give a final
-- consent — which is also their agreement to the partnership.
--
-- 1. sponsored_event_fulfilment — one row per sponsored event, admin-written.
--    A separate table (not columns on sponsored_events) because the parties'
--    policy on sponsored_events is FOR ALL: an unguarded column there would be
--    writable by the brand and the artist (same reasoning as 0095).
--    The artist can read it only once the team has marked it ready; the brand
--    never reads it.
-- 2. acknowledge_fulfilment_form(event) — the artist's final consent. Definer,
--    because the artist has no write access to the table.
-- 3. consent_records (0080) logs the consent — new type/source, new trigger.
-- 4. Notifications for every status change, to the artist and to the admins,
--    in-app and email.
--
-- Additive. Apply before deploying the code that reads it. Re-runnable.
-- =============================================================================

create table if not exists sponsored_event_fulfilment (
  sponsored_event_id uuid primary key references sponsored_events (id) on delete cascade,
  promo_channels     text[] not null default '{}',
  promo_post_count   integer check (promo_post_count is null or promo_post_count >= 0),
  promo_social_urls  text[] not null default '{}',
  promo_start_date   date,
  promo_post_texts   text[] not null default '{}',
  promo_other        text,
  special_terms      text,
  ready_at           timestamptz,
  ready_by           uuid references profiles (id) on delete set null,
  artist_ack_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles (id) on delete set null
);

alter table sponsored_event_fulfilment enable row level security;

drop policy if exists "sponsored_event_fulfilment: admin all" on sponsored_event_fulfilment;
create policy "sponsored_event_fulfilment: admin all" on sponsored_event_fulfilment
  for all using (is_admin()) with check (is_admin());

drop policy if exists "sponsored_event_fulfilment: artist reads when ready" on sponsored_event_fulfilment;
create policy "sponsored_event_fulfilment: artist reads when ready" on sponsored_event_fulfilment
  for select using (
    ready_at is not null
    and exists (
      select 1 from sponsored_events se
       where se.id = sponsored_event_fulfilment.sponsored_event_id
         and se.artist_profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on sponsored_event_fulfilment to authenticated;

drop trigger if exists sponsored_event_fulfilment_set_updated_at on sponsored_event_fulfilment;
create trigger sponsored_event_fulfilment_set_updated_at
  before update on sponsored_event_fulfilment
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- The artist's final consent.
-- Returns: 'ok' | 'already' | 'not_ready' | 'forbidden' | 'closed'
-- -----------------------------------------------------------------------------
create or replace function acknowledge_fulfilment_form(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event sponsored_events%rowtype;
  v_form  sponsored_event_fulfilment%rowtype;
begin
  select * into v_event from sponsored_events where id = p_event_id;
  if not found or v_event.artist_profile_id is distinct from auth.uid() then
    return 'forbidden';
  end if;

  select * into v_form from sponsored_event_fulfilment
   where sponsored_event_id = p_event_id
   for update;
  if not found or v_form.ready_at is null then
    return 'not_ready';
  end if;
  if v_form.artist_ack_at is not null then
    return 'already';
  end if;
  if v_event.status not in ('in_progress', 'confirmed') then
    return 'closed';
  end if;

  update sponsored_event_fulfilment
     set artist_ack_at = now()
   where sponsored_event_id = p_event_id;
  return 'ok';
end;
$$;

revoke all on function acknowledge_fulfilment_form(uuid) from public;
grant execute on function acknowledge_fulfilment_form(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Consent log (0080): the two ticks become evidence.
-- -----------------------------------------------------------------------------
alter table consent_records drop constraint if exists consent_records_consent_type_check;
alter table consent_records add constraint consent_records_consent_type_check check (
  consent_type = any (array[
    'platform_terms', 'privacy_policy', 'email_verified', 'event_terms',
    'sponsor_marketing', 'survey_terms', 'residency_confirmed',
    'order_form_details', 'order_form_terms', 'order_form_documents',
    'fulfilment_commitments', 'fulfilment_terms'
  ]::text[])
);

alter table consent_records drop constraint if exists consent_records_source_check;
alter table consent_records add constraint consent_records_source_check check (
  source = any (array[
    'sign_up', 'survey_sign_up', 'verify_link', 'event_registration',
    'my_events', 'public_survey', 'dashboard_survey', 'order_form',
    'fulfilment_form'
  ]::text[])
);

create or replace function public.consent_from_fulfilment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_email text;
  v_ctx jsonb;
begin
  begin
    select se.artist_profile_id, p.email,
           jsonb_build_object('sponsored_event_id', se.id, 'sponsored_event_reference', se.reference,
                              'event_name', se.name)
      into v_profile, v_email, v_ctx
      from sponsored_events se
      left join profiles p on p.id = se.artist_profile_id
     where se.id = new.sponsored_event_id;
    insert into consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at)
    values
      (v_profile, v_email, 'fulfilment_commitments', true, 'fulfilment_form', v_ctx, new.artist_ack_at),
      (v_profile, v_email, 'fulfilment_terms',       true, 'fulfilment_form', v_ctx, new.artist_ack_at);
  exception when others then
    raise warning 'consent_from_fulfilment (%): %', new.sponsored_event_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists sponsored_event_fulfilment_consent_records on public.sponsored_event_fulfilment;
create trigger sponsored_event_fulfilment_consent_records
  after update of artist_ack_at on public.sponsored_event_fulfilment
  for each row
  when (new.artist_ack_at is not null and old.artist_ack_at is distinct from new.artist_ack_at)
  execute function public.consent_from_fulfilment();

-- -----------------------------------------------------------------------------
-- Notifications: every status change, to the artist and to the admins.
-- -----------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('fulfilment.form_ready', 'Fulfilment form ready',
   'The team has filled in the fulfilment form for a partnership — review it and give your consent.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference}', 237),
  ('fulfilment.form_updated', 'Fulfilment form updated',
   'The team changed the fulfilment form after it was sent — review it and consent again.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference}', 238),
  ('fulfilment.acknowledged', 'Fulfilment form consent received',
   'Confirmation that the artist''s consent to the fulfilment form was recorded.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference}', 239),
  ('fulfilment.proof_received', 'Proof received',
   'Confirmation that the artist''s proof of a promotional commitment was received for review.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference,proof_type}', 240),
  ('admin.fulfilment_ready', 'Fulfilment form sent to artist',
   'A fulfilment form was marked ready and sent to the artist.',
   'admin', 'The admin team', '{user_name,event_name,reference}', 446),
  ('admin.fulfilment_updated', 'Fulfilment form changed after sending',
   'A fulfilment form was edited after it was sent; the artist must consent again.',
   'admin', 'The admin team', '{user_name,event_name,reference}', 447),
  ('admin.fulfilment_acknowledged', 'Artist consented to fulfilment form',
   'The artist gave their final consent to a fulfilment form.',
   'admin', 'The admin team', '{user_name,event_name,reference}', 448),
  ('admin.proof_reviewed', 'Proof reviewed',
   'A team member approved or rejected an artist''s proof.',
   'admin', 'The admin team', '{user_name,event_name,reference,outcome}', 449)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('fulfilment.form_ready', 'in_app', 'Your fulfilment form for {{event_name}} is ready',
   'The Live·En·Synergy team has filled in the fulfilment form for {{event_name}} ({{reference}}). Review the promotional commitments and terms, then give your consent.'),
  ('fulfilment.form_ready', 'email', 'Your fulfilment form for {{event_name}} is ready · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'We''ve filled in the fulfilment form for {{event_name}} ({{reference}}): the promotional commitments, the posts to share and any special terms.' || chr(10) || chr(10) ||
   'Open the partnership in your dashboard to review it, confirm the discount codes and give your consent.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),

  ('fulfilment.form_updated', 'in_app', 'The fulfilment form for {{event_name}} was updated',
   'The team changed the fulfilment form for {{event_name}} ({{reference}}). Please review it and give your consent again.'),
  ('fulfilment.form_updated', 'email', 'Fulfilment form for {{event_name}} updated · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'We''ve updated the fulfilment form for {{event_name}} ({{reference}}). Your earlier consent was cleared so you can confirm the version you''ve actually read.' || chr(10) || chr(10) ||
   'Open the partnership in your dashboard to review it and consent again.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),

  ('fulfilment.acknowledged', 'in_app', 'Your consent for {{event_name}} is recorded',
   'Thanks — we''ve recorded your consent to the fulfilment form for {{event_name}} ({{reference}}).'),
  ('fulfilment.acknowledged', 'email', 'Consent recorded for {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Thanks — we''ve recorded your consent to the fulfilment form for {{event_name}} ({{reference}}). We''ll be in touch about the next steps.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),

  ('fulfilment.proof_received', 'in_app', 'Proof received for {{event_name}}',
   'We''ve received your {{proof_type}} proof for {{event_name}} ({{reference}}). The team will review it.'),
  ('fulfilment.proof_received', 'email', 'Proof received for {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'We''ve received your {{proof_type}} proof for {{event_name}} ({{reference}}). The team will review it and let you know.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),

  ('admin.fulfilment_ready', 'in_app', 'Fulfilment form sent: {{event_name}}',
   'The fulfilment form for {{event_name}} ({{reference}}) was marked ready and sent to the artist.'),
  ('admin.fulfilment_ready', 'email', 'Fulfilment form sent: {{event_name}} · Live·En·Synergy',
   'The fulfilment form for {{event_name}} ({{reference}}) was marked ready and sent to the artist for their consent.'),

  ('admin.fulfilment_updated', 'in_app', 'Fulfilment form changed: {{event_name}}',
   'The fulfilment form for {{event_name}} ({{reference}}) was edited after sending. The artist has been asked to consent again.'),
  ('admin.fulfilment_updated', 'email', 'Fulfilment form changed: {{event_name}} · Live·En·Synergy',
   'The fulfilment form for {{event_name}} ({{reference}}) was edited after it was sent. The artist''s consent was cleared and they have been asked to consent again.'),

  ('admin.fulfilment_acknowledged', 'in_app', 'Artist consented: {{event_name}}',
   'The artist gave their final consent to the fulfilment form for {{event_name}} ({{reference}}).'),
  ('admin.fulfilment_acknowledged', 'email', 'Artist consented: {{event_name}} · Live·En·Synergy',
   'The artist gave their final consent to the fulfilment form for {{event_name}} ({{reference}}).'),

  ('admin.proof_reviewed', 'in_app', 'Proof {{outcome}}: {{event_name}}',
   'A {{outcome}} decision was recorded on proof for {{event_name}} ({{reference}}).'),
  ('admin.proof_reviewed', 'email', 'Proof {{outcome}}: {{event_name}} · Live·En·Synergy',
   'A {{outcome}} decision was recorded on proof for {{event_name}} ({{reference}}).')
on conflict (event_key, channel) do nothing;
