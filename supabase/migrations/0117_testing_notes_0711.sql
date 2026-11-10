-- =============================================================================
-- 0117 — Testing notes 7 Nov (client "General Notes" doc, tab "Testing notes").
--
-- 1. account.password_reset: our own branded reset email (the Supabase one
--    didn't mention Live·En·Synergy and its link could land on localhost).
--    The app sends it through notify() with a token_hash link to
--    /auth/callback; until the template carries a link it uses Supabase's.
--
-- Additive and re-runnable.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
-- account.password_reset exists since 0006 as a placeholder nobody sent ("A
-- password reset was requested.", no link). It becomes the real email: the
-- wording is replaced only while it's still that default (an admin's edit is
-- kept — the app falls back to Supabase's email if a template has no link
-- token), the variables list names the link, and the in-app copy is switched
-- off (a reset request isn't something to read in the bell).
update public.notification_events
   set variables = '{user_name,reset_link,link}',
       description = 'Sent from "Forgot password" with a link to choose a new password. Works on any device; the link lasts one hour and works once.'
 where key = 'account.password_reset';

insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('account.password_reset', 'Password reset',
   'Sent from "Forgot password" with a link to choose a new password. Works on any device; the link lasts one hour and works once.',
   'account', 'The user', '{user_name,reset_link,link}', 70)
on conflict (key) do nothing;

insert into public.notification_settings (event_key, in_app_enabled, email_enabled)
values ('account.password_reset', false, true)
on conflict (event_key) do nothing;

update public.notification_settings s
   set in_app_enabled = false
 where s.event_key = 'account.password_reset'
   and exists (select 1 from public.notification_templates t
                where t.event_key = s.event_key and t.channel = 'in_app'
                  and t.body = 'A password reset was requested.');

update public.notification_templates
   set subject = 'Reset your Live·En·Synergy password',
       body = 'Hi {{user_name}},' || chr(10) || chr(10) ||
              'Someone (hopefully you) asked to reset the password for your Live·En·Synergy account.' || chr(10) || chr(10) ||
              'Open this link to choose a new password:' || chr(10) || chr(10) ||
              '{{reset_link}}' || chr(10) || chr(10) ||
              'The link works once and lasts one hour. If it has expired, use "Forgot password" on the sign-in page again.' || chr(10) || chr(10) ||
              'Didn''t ask for this? You can ignore this email — your password stays the same.' || chr(10) || chr(10) ||
              '— The Live·En·Synergy team'
 where event_key = 'account.password_reset' and channel = 'email'
   and body = 'Hi {{user_name}},' || chr(10) || chr(10) || 'A password reset was requested.' || chr(10) || chr(10) || '— The Live·En·Synergy team';

insert into public.notification_templates (event_key, channel, subject, body) values
  ('account.password_reset', 'email', 'Reset your Live·En·Synergy password',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Someone (hopefully you) asked to reset the password for your Live·En·Synergy account.' || chr(10) || chr(10) ||
   'Open this link to choose a new password:' || chr(10) || chr(10) ||
   '{{reset_link}}' || chr(10) || chr(10) ||
   'The link works once and lasts one hour. If it has expired, use "Forgot password" on the sign-in page again.' || chr(10) || chr(10) ||
   'Didn''t ask for this? You can ignore this email — your password stays the same.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;

-- 2 ---------------------------------------------------------------------------
-- Campaign request form (Testing notes 7 Nov): brands pick a package instead
-- of typing a budget, and say who they want to hear from (age range + other
-- criteria) instead of "reward rules". The old columns stay for old requests.
alter table public.campaign_intake_requests
  add column if not exists package_id uuid references public.campaign_packages (id) on delete set null,
  add column if not exists audience_age_min integer,
  add column if not exists audience_age_max integer,
  add column if not exists audience_criteria text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_intake_requests_audience_age_check') then
    alter table public.campaign_intake_requests
      add constraint campaign_intake_requests_audience_age_check check (
        (audience_age_min is null or audience_age_min between 18 and 120)
        and (audience_age_max is null or audience_age_max between 18 and 120)
        and (audience_age_min is null or audience_age_max is null or audience_age_min <= audience_age_max)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_intake_requests_audience_criteria_len') then
    alter table public.campaign_intake_requests
      add constraint campaign_intake_requests_audience_criteria_len check (audience_criteria is null or char_length(audience_criteria) <= 2000);
  end if;
end $$;

-- 3 ---------------------------------------------------------------------------
-- Order form surveys (Testing notes 7 Nov). "Draft survey link" was a free
-- text box; admins pasted the admin preview link, which a brand can't open,
-- so the brand was bounced to their dashboard. Now: a post-event link too,
-- and a brand-safe preview of any of our own surveys the form links to.
alter table public.campaign_order_forms
  add column if not exists post_survey_link text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_order_forms_post_survey_link_len') then
    alter table public.campaign_order_forms
      add constraint campaign_order_forms_post_survey_link_len check (post_survey_link is null or char_length(post_survey_link) <= 1000);
  end if;
end $$;

-- The survey as a participant sees it (no hidden fields, no attention-check
-- answers), for an admin or for the brand the order form was sent to — and
-- only a survey that belongs to the form's campaign or that the form links to.
create or replace function public.order_form_survey_preview(p_form_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f record;
  t record;
  v_questions jsonb;
begin
  select cof.*, b.profile_id as brand_profile_id
    into f
    from campaign_order_forms cof join brands b on b.id = cof.brand_id
   where cof.id = p_form_id;
  if not found then
    return null;
  end if;
  if not (public.is_admin() or (f.brand_profile_id = auth.uid() and f.status <> 'draft')) then
    return null;
  end if;

  select * into t from survey_templates where id = p_template_id;
  if not found then
    return null;
  end if;
  if not (t.campaign_id = f.campaign_id
          or coalesce(f.draft_survey_link, '') like '%' || p_template_id::text || '%'
          or coalesce(f.post_survey_link, '') like '%' || p_template_id::text || '%') then
    return null;
  end if;

  select coalesce(jsonb_agg(
           case when q.type = 'attention_check' then to_jsonb(q) || jsonb_build_object('config', (q.config - 'expected_answer'))
                else to_jsonb(q) end
           order by q.order_index), '[]'::jsonb)
    into v_questions
    from survey_questions q
   where q.template_id = p_template_id and q.type <> 'hidden_field';

  return jsonb_build_object('template', to_jsonb(t), 'questions', v_questions);
end;
$$;
revoke all on function public.order_form_survey_preview(uuid, uuid) from public, anon;
grant execute on function public.order_form_survey_preview(uuid, uuid) to authenticated, service_role;

-- 4 ---------------------------------------------------------------------------
-- Artist / organiser public profile: their live partnered events (Testing
-- notes 7 Nov: "profiles not displaying upcoming events"). Raw listings stay
-- off the public site (0106); these are the events that already have a public
-- page (/events/<id>) — confirmed, campaign live, not past. Same rows and
-- rules as public_live_events(), filtered to one artist/organiser.
create or replace function public.public_profile_live_events(p_profile_id uuid)
returns table (
  id uuid, name text, event_date date, start_time time, timezone text,
  venue text, category text, banner_url text,
  artist_name text, brand_name text, brand_logo_url text,
  is_open boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select ple.*
    from public.public_live_events() ple
    join public.sponsored_events se on se.id = ple.id
   where se.artist_profile_id = p_profile_id
   limit 12
$$;
revoke all on function public.public_profile_live_events(uuid) from public;
grant execute on function public.public_profile_live_events(uuid) to anon, authenticated, service_role;

-- 5 ---------------------------------------------------------------------------
-- Artists don't see the package value (Testing notes 7 Nov: "Both parties have
-- agreed — the partnership ... is live (£3,750)" — not money they receive).
-- The figure is removed from the proposal and confirmation templates (both
-- channels); the app also stops passing it to artists. A targeted replace, so
-- any other wording an admin changed is kept.
update public.notification_templates
   set body = replace(replace(body, ' ({{budget}})', ''), '({{budget}})', ''),
       subject = replace(replace(coalesce(subject, ''), ' ({{budget}})', ''), '({{budget}})', '')
 where event_key in ('sponsorship.confirmed', 'offer.proposal_received')
   and (body like '%{{budget}}%' or coalesce(subject, '') like '%{{budget}}%');

-- 6 ---------------------------------------------------------------------------
-- Discount-code email (Testing notes 7 Nov): "VYBED-KJF6-RN56 (20)" read as if
-- "(20)" were part of the code. The code now stands on its own line and the
-- offer is labelled separately. Targeted replace — other edits are kept.
update public.notification_templates
   set body = replace(body, '{{code}}  ({{value_label}})',
                      'Your code:  {{code}}' || chr(10) || chr(10) || 'Offer: {{value_label}}')
 where event_key = 'reward.code_issued' and channel = 'email'
   and body like '%{{code}}  ({{value_label}})%';

update public.notification_templates
   set body = replace(body, '{{code}} — {{value_label}}.', 'Your code is {{code}} (offer: {{value_label}}).')
 where event_key = 'reward.code_issued' and channel = 'in_app'
   and body like '%{{code}} — {{value_label}}.%';
