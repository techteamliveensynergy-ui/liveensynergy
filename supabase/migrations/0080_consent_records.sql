-- 0080 — consent records (17 Oct 2026).
--
-- One append-only row per consent a person gives or withdraws, with when,
-- which version, where it was given and what it was about — so the admin's
-- user page can show the full history, read-only, and so the platform can
-- prove consent (UK GDPR art. 7(1)). Before this the facts were scattered
-- over profiles/participations/survey_responses/campaign_order_forms, some
-- without a timestamp at all (participations.newsletter_opt_in), and a
-- change overwrote the previous value.
--
-- Written ONLY by triggers on the tables where consent is captured (plus one
-- narrow RPC for the dashboard survey's tick, which stores nothing else), so
-- every existing and future capture path is covered without trusting the
-- app to remember. Nobody — admins included — can insert, edit or delete a
-- record; the only change allowed is profile_id being linked (public-survey
-- respondent who later gets an account) or cleared (account deleted).

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  -- Who gave it when there was no account yet (public survey), and a record
  -- of the address that survives the account being deleted.
  subject_email text,
  consent_type text not null check (consent_type in (
    'platform_terms',       -- role Terms & Conditions, at sign-up
    'privacy_policy',       -- Privacy Policy, at sign-up or on a survey
    'email_verified',       -- confirmed the address via our link (0074)
    'event_terms',          -- event registration terms
    'sponsor_marketing',    -- "sponsor's newsletter & promotions" (My events)
    'survey_terms',         -- survey Terms & Conditions
    'residency_confirmed',  -- "18 or over and a UK resident" (public survey)
    'order_form_details',   -- brand approved the order form's details
    'order_form_terms'      -- brand accepted the order form's terms
  )),
  granted boolean not null,
  version text,
  source text not null check (source in (
    'sign_up', 'survey_sign_up', 'verify_link', 'event_registration',
    'my_events', 'public_survey', 'dashboard_survey', 'order_form'
  )),
  context jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  -- True for rows reconstructed by this migration from data captured before
  -- the ledger existed; recorded_at is then the original capture time, or
  -- the row's last update where none was kept (context.approximate_time).
  backfilled boolean not null default false
);

create index if not exists consent_records_profile_idx on public.consent_records (profile_id, recorded_at desc);
create index if not exists consent_records_email_idx on public.consent_records (lower(subject_email));

alter table public.consent_records enable row level security;

drop policy if exists "consent_records: admin read" on public.consent_records;
create policy "consent_records: admin read" on public.consent_records
  for select using (public.is_admin());
drop policy if exists "consent_records: own read" on public.consent_records;
create policy "consent_records: own read" on public.consent_records
  for select using (profile_id = auth.uid());

revoke insert, update, delete, truncate on public.consent_records from anon, authenticated;

create or replace function public.consent_records_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Consent records cannot be deleted' using errcode = '42501';
  end if;
  -- Only profile_id may move (linking a respondent to their new account, or
  -- ON DELETE SET NULL when the account goes); everything else is evidence.
  if (to_jsonb(new) - 'profile_id') is distinct from (to_jsonb(old) - 'profile_id') then
    raise exception 'Consent records cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists consent_records_immutable on public.consent_records;
create trigger consent_records_immutable
  before update or delete on public.consent_records
  for each row execute function public.consent_records_immutable();

-- ---------------------------------------------------------------------------
-- Capture: profiles (sign-up terms + privacy, email verification)
-- ---------------------------------------------------------------------------
create or replace function public.consent_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
begin
  begin
    if new.terms_accepted_at is not null
       and (tg_op = 'INSERT' or new.terms_accepted_at is distinct from old.terms_accepted_at) then
      select case when u.raw_user_meta_data->>'survey_account' = 'true' then 'survey_sign_up' else 'sign_up' end
        into v_source
        from auth.users u where u.id = new.id;
      insert into consent_records (profile_id, subject_email, consent_type, granted, version, source, context, recorded_at)
      values
        (new.id, new.email, 'platform_terms', true, new.terms_version, coalesce(v_source, 'sign_up'),
         jsonb_build_object('role', new.role), new.terms_accepted_at),
        (new.id, new.email, 'privacy_policy', true, new.terms_version, coalesce(v_source, 'sign_up'),
         jsonb_build_object('role', new.role), new.terms_accepted_at);
    end if;

    if new.email_verified_at is not null
       and (tg_op = 'INSERT' or old.email_verified_at is null) then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, recorded_at)
      values (new.id, new.email, 'email_verified', true, 'verify_link', new.email_verified_at);
    end if;
  exception when others then
    -- A consent record failing must never fail the sign-up itself.
    raise warning 'consent_from_profile (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists profiles_consent_records on public.profiles;
create trigger profiles_consent_records
  after insert or update of terms_accepted_at, email_verified_at on public.profiles
  for each row execute function public.consent_from_profile();

-- ---------------------------------------------------------------------------
-- Capture: participations (event terms at registration, sponsor marketing)
-- ---------------------------------------------------------------------------
create or replace function public.consent_from_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb;
  v_email text;
begin
  begin
    select jsonb_build_object('sponsored_event_id', se.id, 'event_reference', se.reference, 'event_name', se.name)
      into v_ctx
      from sponsored_events se where se.id = new.sponsored_event_id;
    select email into v_email from profiles where id = new.audience_profile_id;

    if tg_op = 'INSERT' and new.terms_accepted_at is not null then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at)
      values (new.audience_profile_id, v_email, 'event_terms', true, 'event_registration',
              coalesce(v_ctx, '{}'::jsonb), new.terms_accepted_at);
    end if;

    if (tg_op = 'INSERT' and new.newsletter_opt_in)
       or (tg_op = 'UPDATE' and new.newsletter_opt_in is distinct from old.newsletter_opt_in) then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, context)
      values (new.audience_profile_id, v_email, 'sponsor_marketing', coalesce(new.newsletter_opt_in, false),
              case when tg_op = 'INSERT' then 'event_registration' else 'my_events' end,
              coalesce(v_ctx, '{}'::jsonb));
    end if;
  exception when others then
    raise warning 'consent_from_participation (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists participations_consent_records on public.participations;
create trigger participations_consent_records
  after insert or update of newsletter_opt_in on public.participations
  for each row execute function public.consent_from_participation();

-- ---------------------------------------------------------------------------
-- Capture: survey_responses (public survey's terms/privacy + residency)
-- ---------------------------------------------------------------------------
create or replace function public.consent_from_survey_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_ctx jsonb;
begin
  begin
    if tg_op = 'UPDATE' then
      -- A respondent who answered before having an account, now linked.
      if old.respondent_profile_id is null and new.respondent_profile_id is not null then
        update consent_records set profile_id = new.respondent_profile_id
         where profile_id is null and context->>'response_id' = new.id::text;
      end if;
      return new;
    end if;

    v_profile := coalesce(
      new.respondent_profile_id,
      (select audience_profile_id from participations where id = new.participation_id)
    );
    select jsonb_build_object('response_id', new.id, 'response_reference', new.reference,
                              'survey_id', t.id, 'survey_title', t.title)
      into v_ctx
      from survey_templates t where t.id = new.template_id;

    if new.consent_accepted_at is not null then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at)
      values
        (v_profile, new.respondent_email, 'survey_terms', true, 'public_survey', coalesce(v_ctx, '{}'::jsonb), new.consent_accepted_at),
        (v_profile, new.respondent_email, 'privacy_policy', true, 'public_survey', coalesce(v_ctx, '{}'::jsonb), new.consent_accepted_at);
    end if;
    if new.residency_confirmed then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at)
      values (v_profile, new.respondent_email, 'residency_confirmed', true, 'public_survey',
              coalesce(v_ctx, '{}'::jsonb), coalesce(new.consent_accepted_at, new.submitted_at, now()));
    end if;
  exception when others then
    raise warning 'consent_from_survey_response (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists survey_responses_consent_records on public.survey_responses;
create trigger survey_responses_consent_records
  after insert or update of respondent_profile_id on public.survey_responses
  for each row execute function public.consent_from_survey_response();

-- ---------------------------------------------------------------------------
-- Capture: campaign_order_forms (brand's two approval consents)
-- ---------------------------------------------------------------------------
create or replace function public.consent_from_order_form()
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
    select b.profile_id, p.email into v_profile, v_email
      from brands b join profiles p on p.id = b.profile_id
     where b.id = new.brand_id;
    v_profile := coalesce(new.approved_by, v_profile);
    v_ctx := jsonb_build_object('order_form_id', new.id, 'order_form_reference', new.reference,
                                'campaign_id', new.campaign_id, 'campaign_name', new.campaign_name);
    insert into consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at)
    values
      (v_profile, v_email, 'order_form_details', coalesce(new.consent_details_approved, false), 'order_form', v_ctx,
       coalesce(new.approved_at, now())),
      (v_profile, v_email, 'order_form_terms', coalesce(new.consent_terms_accepted, false), 'order_form', v_ctx,
       coalesce(new.approved_at, now()));
  exception when others then
    raise warning 'consent_from_order_form (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists campaign_order_forms_consent_records on public.campaign_order_forms;
create trigger campaign_order_forms_consent_records
  after update of status on public.campaign_order_forms
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.consent_from_order_form();

-- ---------------------------------------------------------------------------
-- The dashboard survey's "I agree to the Terms & Conditions and Privacy
-- Policy" tick stores nothing anywhere else (SurveyForm.tsx), so the
-- submitting server action records it here: for the caller only, and only
-- against a published survey.
-- ---------------------------------------------------------------------------
create or replace function public.record_survey_consent(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_email text;
begin
  if v_uid is null then
    return;
  end if;
  select jsonb_build_object('survey_id', t.id, 'survey_title', t.title)
    into v_ctx
    from survey_templates t where t.id = p_template_id and t.status = 'published';
  if v_ctx is null then
    return;
  end if;
  -- One record per person per survey is all the tick means.
  if exists (
    select 1 from consent_records
     where profile_id = v_uid and consent_type = 'survey_terms'
       and context->>'survey_id' = p_template_id::text
  ) then
    return;
  end if;
  select email into v_email from profiles where id = v_uid;
  insert into consent_records (profile_id, subject_email, consent_type, granted, source, context)
  values (v_uid, v_email, 'survey_terms', true, 'dashboard_survey', v_ctx),
         (v_uid, v_email, 'privacy_policy', true, 'dashboard_survey', v_ctx);
end;
$$;

revoke all on function public.record_survey_consent(uuid) from public, anon;
grant execute on function public.record_survey_consent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill from what was captured before the ledger.
-- ---------------------------------------------------------------------------
insert into public.consent_records (profile_id, subject_email, consent_type, granted, version, source, context, recorded_at, backfilled)
select p.id, p.email, t.kind, true, p.terms_version,
       case when u.raw_user_meta_data->>'survey_account' = 'true' then 'survey_sign_up' else 'sign_up' end,
       jsonb_build_object('role', p.role), p.terms_accepted_at, true
  from public.profiles p
  left join auth.users u on u.id = p.id
  cross join (values ('platform_terms'), ('privacy_policy')) as t(kind)
 where p.terms_accepted_at is not null;

insert into public.consent_records (profile_id, subject_email, consent_type, granted, source, recorded_at, backfilled)
select p.id, p.email, 'email_verified', true, 'verify_link', p.email_verified_at, true
  from public.profiles p
 where p.email_verified_at is not null;

insert into public.consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at, backfilled)
select pa.audience_profile_id, pr.email, 'event_terms', true, 'event_registration',
       jsonb_build_object('sponsored_event_id', se.id, 'event_reference', se.reference, 'event_name', se.name),
       pa.terms_accepted_at, true
  from public.participations pa
  join public.sponsored_events se on se.id = pa.sponsored_event_id
  left join public.profiles pr on pr.id = pa.audience_profile_id
 where pa.terms_accepted_at is not null;

-- The opt-in was a bare boolean: when it was ticked wasn't kept, so the
-- row's last update stands in, flagged as approximate.
insert into public.consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at, backfilled)
select pa.audience_profile_id, pr.email, 'sponsor_marketing', true, 'my_events',
       jsonb_build_object('sponsored_event_id', se.id, 'event_reference', se.reference, 'event_name', se.name,
                          'approximate_time', true),
       pa.updated_at, true
  from public.participations pa
  join public.sponsored_events se on se.id = pa.sponsored_event_id
  left join public.profiles pr on pr.id = pa.audience_profile_id
 where pa.newsletter_opt_in;

insert into public.consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at, backfilled)
select coalesce(r.respondent_profile_id, pa.audience_profile_id), r.respondent_email, k.kind, true, 'public_survey',
       jsonb_build_object('response_id', r.id, 'response_reference', r.reference, 'survey_id', t.id, 'survey_title', t.title),
       coalesce(r.consent_accepted_at, r.submitted_at), true
  from public.survey_responses r
  join public.survey_templates t on t.id = r.template_id
  left join public.participations pa on pa.id = r.participation_id
  cross join (values ('survey_terms'), ('privacy_policy'), ('residency_confirmed')) as k(kind)
 where (k.kind in ('survey_terms', 'privacy_policy') and r.consent_accepted_at is not null)
    or (k.kind = 'residency_confirmed' and r.residency_confirmed);

insert into public.consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at, backfilled)
select coalesce(f.approved_by, b.profile_id), p.email, k.kind,
       case k.kind when 'order_form_details' then coalesce(f.consent_details_approved, false)
                   else coalesce(f.consent_terms_accepted, false) end,
       'order_form',
       jsonb_build_object('order_form_id', f.id, 'order_form_reference', f.reference,
                          'campaign_id', f.campaign_id, 'campaign_name', f.campaign_name),
       f.approved_at, true
  from public.campaign_order_forms f
  join public.brands b on b.id = f.brand_id
  left join public.profiles p on p.id = b.profile_id
  cross join (values ('order_form_details'), ('order_form_terms')) as k(kind)
 where f.status = 'approved' and f.approved_at is not null;
