-- =============================================================================
-- 0112 — every notification carries a link, in the email too; and a response
-- that needs review tells the admin and the respondent (QA 5/6 Nov).
--
-- 1. LINKS IN EMAIL. A notification already has a deep link (/dashboard/sponsored/
--    <id>#discount-codes, /dashboard/rewards, …) — but it was stored on the in-app
--    row only. The email carried a link only if its template text happened to
--    contain a URL, and most don't, so an email could say "your response needs
--    review" without any way to get there. email_outbox gains `link` (a site path),
--    enqueue_notification() stores it there too, and the sender turns it into an
--    action button ("Review this response", "View my rewards", …). Also:
--    notify_from_db() used to drop the link when the in-app channel was switched
--    off for an event — it now passes it on for whichever channel is on.
--    Both functions below are 0006's / 0075's, reproduced with only those changes.
--
-- 2. REVIEW NOTIFICATIONS. A response lands in quality_status 'review' two ways:
--    the quality check flagged it (a duplicate-device flag, a low score) or it came
--    in past the participant limit (0083). Either way the respondent saw only
--    "being reviewed" and nobody told the admin, so it sat. Now, once per
--    transition into 'review':
--      - every active admin gets admin.survey_needs_review, linking straight to
--        THAT response (/dashboard/admin/surveys/responses/<id>);
--      - the respondent gets survey.under_review ("we'll get back to you");
--    and when an admin then rejects it (review -> reject) the respondent gets
--    survey.review_declined, so "we'll get back to you" is kept. (An approval
--    needs no extra message: passing it issues the code, which already notifies.)
--    Fired from the database, so it covers the public link, the dashboard and a
--    re-score alike. A failure is a warning, never a failed submission.
--    Nothing here tells the respondent WHY (M-06): no score, no signal.
--
-- Additive: one column, two functions re-declared, three notification events, one
-- trigger function, three triggers. Safe before or after the code (before: emails
-- have no button; after: they do). Re-runnable.
-- =============================================================================
alter table public.email_outbox add column if not exists link text;

create or replace function enqueue_notification(
  p_event_key     text,
  p_recipient     uuid,
  p_in_app_title  text default null,
  p_in_app_body   text default null,
  p_link          text default null,
  p_email_to      text default null,
  p_email_cc      text[] default null,
  p_email_bcc     text[] default null,
  p_email_subject text default null,
  p_email_body    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_in_app_title is not null then
    insert into public.notifications
      (recipient_profile_id, event_key, title, body, link)
    values (p_recipient, p_event_key, p_in_app_title, p_in_app_body, p_link);
  end if;

  if p_email_to is not null then
    insert into public.email_outbox
      (to_email, cc, bcc, subject, body, event_key, recipient_profile_id, status, link)
    values (p_email_to, p_email_cc, p_email_bcc, p_email_subject, p_email_body,
            p_event_key, p_recipient, 'queued', p_link);
  end if;
end;
$$;

create or replace function public.notify_from_db(
  p_event_key text,
  p_recipient uuid,
  p_vars jsonb,
  p_link text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_in_app   record;
  v_email    record;
  v_profile  record;
  v_vars     jsonb;
begin
  select in_app_enabled, email_enabled, email_cc, email_bcc into v_settings
    from notification_settings where event_key = p_event_key;
  if not found then
    return;
  end if;
  select subject, body into v_in_app from notification_templates
   where event_key = p_event_key and channel = 'in_app' limit 1;
  select subject, body into v_email from notification_templates
   where event_key = p_event_key and channel = 'email' limit 1;
  select email, full_name into v_profile from profiles where id = p_recipient;
  v_vars := jsonb_build_object('user_name', coalesce(v_profile.full_name, 'there')) || coalesce(p_vars, '{}'::jsonb);

  perform enqueue_notification(
    p_event_key,
    p_recipient,
    case when v_settings.in_app_enabled and v_in_app.subject is not null
         then render_notification_tokens(v_in_app.subject, v_vars) end,
    case when v_settings.in_app_enabled and v_in_app.subject is not null
         then render_notification_tokens(v_in_app.body, v_vars) end,
    p_link,
    case when v_settings.email_enabled and v_email.subject is not null then v_profile.email end,
    case when v_settings.email_enabled then v_settings.email_cc end,
    case when v_settings.email_enabled then v_settings.email_bcc end,
    case when v_settings.email_enabled then render_notification_tokens(v_email.subject, v_vars) end,
    case when v_settings.email_enabled then render_notification_tokens(v_email.body, v_vars) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Review notifications.
-- ---------------------------------------------------------------------------
create or replace function public.survey_review_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title      text;
  v_respondent uuid;
  v_name       text;
  v_admin      record;
begin
  begin
    select t.title into v_title from public.survey_templates t where t.id = new.template_id;
    v_title := coalesce(nullif(btrim(v_title), ''), 'the survey');

    v_respondent := coalesce(
      new.respondent_profile_id,
      (select p.audience_profile_id from public.participations p where p.id = new.participation_id)
    );
    v_name := coalesce(
      nullif(btrim(concat_ws(' ', new.respondent_first_name, new.respondent_last_name)), ''),
      (select pr.full_name from public.profiles pr where pr.id = v_respondent),
      'A respondent'
    );

    for v_admin in select id from public.profiles where role = 'admin' and is_active loop
      perform public.notify_from_db(
        'admin.survey_needs_review',
        v_admin.id,
        jsonb_build_object(
          'survey_title',    v_title,
          'respondent_name', v_name,
          'score',           coalesce(new.quality_score::text, 'not scored')),
        '/dashboard/admin/surveys/responses/' || new.id::text
      );
    end loop;

    if v_respondent is not null then
      perform public.notify_from_db(
        'survey.under_review',
        v_respondent,
        jsonb_build_object('survey_title', v_title),
        '/dashboard/participations'
      );
    end if;
  exception when others then
    raise warning 'survey_review_notify (response %) failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.survey_review_notify() from public, anon, authenticated;

create or replace function public.survey_review_declined_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title      text;
  v_respondent uuid;
begin
  begin
    select t.title into v_title from public.survey_templates t where t.id = new.template_id;
    v_respondent := coalesce(
      new.respondent_profile_id,
      (select p.audience_profile_id from public.participations p where p.id = new.participation_id)
    );
    if v_respondent is not null then
      perform public.notify_from_db(
        'survey.review_declined',
        v_respondent,
        jsonb_build_object('survey_title', coalesce(nullif(btrim(v_title), ''), 'the survey')),
        '/dashboard/participations'
      );
    end if;
  exception when others then
    raise warning 'survey_review_declined_notify (response %) failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.survey_review_declined_notify() from public, anon, authenticated;

-- A WHEN clause on an INSERT trigger may not mention OLD, so insert and update
-- are separate triggers around the same function.
drop trigger if exists survey_responses_review_notify_insert on public.survey_responses;
create trigger survey_responses_review_notify_insert
  after insert on public.survey_responses
  for each row when (new.quality_status = 'review')
  execute function public.survey_review_notify();

drop trigger if exists survey_responses_review_notify_update on public.survey_responses;
create trigger survey_responses_review_notify_update
  after update of quality_status on public.survey_responses
  for each row when (new.quality_status = 'review' and old.quality_status is distinct from 'review')
  execute function public.survey_review_notify();

drop trigger if exists survey_responses_review_declined on public.survey_responses;
create trigger survey_responses_review_declined
  after update of quality_status on public.survey_responses
  for each row when (old.quality_status = 'review' and new.quality_status = 'reject')
  execute function public.survey_review_declined_notify();

insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.survey_needs_review', 'Survey response needs review',
   'A survey response was held for review (flagged by the quality check, or past the participant limit). It needs an admin decision before any discount code is issued.',
   'admin', 'The admin team', '{user_name,survey_title,respondent_name,score}', 450),
  ('survey.under_review', 'Your survey response is under review',
   'Sent to a respondent whose response is being reviewed by the team.',
   'account', 'The respondent', '{user_name,survey_title}', 451),
  ('survey.review_declined', 'Survey response not approved',
   'Sent to a respondent when the team reviewed their response and did not approve it.',
   'account', 'The respondent', '{user_name,survey_title}', 452)
on conflict (key) do nothing;

insert into public.notification_settings (event_key)
select key from public.notification_events
 where key in ('admin.survey_needs_review', 'survey.under_review', 'survey.review_declined')
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select v.event_key, v.channel, v.subject, v.body
from (values
  ('admin.survey_needs_review', 'in_app', 'Needs your review: {{respondent_name}} · {{survey_title}}',
   '{{respondent_name}}''s response to {{survey_title}} was held for review (quality score: {{score}}). No discount code is issued until you pass it.'),
  ('admin.survey_needs_review', 'email', 'Needs your review: {{respondent_name}} · {{survey_title}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{respondent_name}}''s response to {{survey_title}} was held for review (quality score: {{score}}).' || chr(10) || chr(10) ||
   'It was either flagged by the quality check (for example a possible duplicate) or arrived past the participant limit. The respondent has been told it is under review. No discount code is issued until you pass it — open the response to see why it was held and decide.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('survey.under_review', 'in_app', 'Your response to {{survey_title}} is under review',
   'Thanks for completing {{survey_title}}. Our team is taking a look at your response and will get back to you shortly. If everything is fine, your discount code will be emailed to you and will appear under My rewards.'),
  ('survey.under_review', 'email', 'Your response to {{survey_title}} is under review · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Thanks for completing {{survey_title}}.' || chr(10) || chr(10) ||
   'Our team is taking a look at your response and will get back to you shortly. If everything is fine, your discount code will be emailed to you and will appear under My rewards — there is nothing you need to do in the meantime.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('survey.review_declined', 'in_app', 'Update on your response to {{survey_title}}',
   'We reviewed your response to {{survey_title}} and weren''t able to approve it, so no discount code was issued for it. If you think we''ve got this wrong, please tell us using the Feedback button.'),
  ('survey.review_declined', 'email', 'Update on your response to {{survey_title}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'We reviewed your response to {{survey_title}} and weren''t able to approve it, so no discount code was issued for it.' || chr(10) || chr(10) ||
   'If you think we''ve got this wrong, please tell us using the Feedback button in your dashboard and we''ll look again.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
) as v(event_key, channel, subject, body)
where not exists (
  select 1 from public.notification_templates t
   where t.event_key = v.event_key and t.channel = v.channel
);
