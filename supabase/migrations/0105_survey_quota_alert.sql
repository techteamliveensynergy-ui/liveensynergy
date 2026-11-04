-- =============================================================================
-- 0105 — email the team when a survey reaches 100% of its expected
-- participants (2 Nov standup follow-up to #34 / 0083).
--
-- Where the survey stages stand (expected participants = E, buffer = B%,
-- default 10, `survey_templates.response_buffer_pct`):
--
--   < 90% of E    open
--   90% – 99%     "Places are filling up" on the page          (0083)
--   100% – < E+B% NEW: the quota is filled. Responses are still accepted and
--                 processed as normal (that is the buffer), but a discount code
--                 can no longer be promised — the page shows an alert and the
--                 submit step asks the respondent to confirm. This migration
--                 adds the EMAIL: every admin is told once.
--   >= E+B%       "participant limit reached"; responses are held for admin
--                 review (0083).
--
-- The page alert and the pop-up need no database change (the capacity RPC
-- already returns expected_participants and responses). The email does:
--
--   1. survey_templates.quota_alert_sent_at — the once-only stamp.
--   2. survey_quota_alert() — AFTER INSERT on survey_responses. Counts the
--      places used the way survey_capacity_state() does (rejected responses
--      don't use one), and when the count first reaches E it claims the stamp
--      with a conditional UPDATE (so two simultaneous submissions can't both
--      send) and notifies every active admin through notify_from_db() (0075),
--      in-app and email per the admin's notification settings. A failure is a
--      warning, never a failed submission.
--   3. Changing a survey's expected participants or buffer clears the stamp, so
--      a raised target gets its own alert when it is reached.
--   4. BACKFILL: a survey that is already at or over its quota when this is
--      applied is stamped, so nobody gets a surprise email about an old survey;
--      only future crossings alert.
--   5. Notification event admin.survey_quota_reached (catalogue + settings +
--      templates — notify_from_db() no-ops without all three, CLAUDE.md).
--
-- Additive (one nullable column, one new function + trigger on each table).
-- Apply before deploying the code only if you want the email from the first
-- minute; the page alert and pop-up work without it.
-- =============================================================================

alter table public.survey_templates
  add column if not exists quota_alert_sent_at timestamptz;
comment on column public.survey_templates.quota_alert_sent_at is
  'When admins were told this survey reached 100% of its expected participants (0105). Cleared when the target changes.';

-- ---------------------------------------------------------------------------
-- 3. A new target gets its own alert.
-- ---------------------------------------------------------------------------
create or replace function public.survey_templates_reset_quota_alert()
returns trigger
language plpgsql
as $$
begin
  if new.expected_participants is distinct from old.expected_participants
     or new.response_buffer_pct is distinct from old.response_buffer_pct then
    new.quota_alert_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists survey_templates_reset_quota_alert on public.survey_templates;
create trigger survey_templates_reset_quota_alert
  before update of expected_participants, response_buffer_pct on public.survey_templates
  for each row execute function public.survey_templates_reset_quota_alert();

-- ---------------------------------------------------------------------------
-- 2. The alert
-- ---------------------------------------------------------------------------
create or replace function public.survey_quota_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected int;
  v_buffer   int;
  v_title    text;
  v_count    int;
  v_limit    int;
  v_admin    record;
begin
  begin
    -- Not yet alerted, and there is a target to reach (the template's own, or
    -- the order form's approximate participants — same fallback as 0056).
    select coalesce(t.expected_participants, f.approx_participants), t.response_buffer_pct, t.title
      into v_expected, v_buffer, v_title
      from public.survey_templates t
      left join public.campaign_order_forms f on f.campaign_id = t.campaign_id
     where t.id = new.template_id
       and t.quota_alert_sent_at is null;
    if v_expected is null then
      return new;
    end if;

    select count(*) into v_count
      from public.survey_responses
     where template_id = new.template_id
       and quality_status <> 'reject';
    if v_count < v_expected then
      return new;
    end if;

    -- Whoever flips null -> now() sends; anyone else finds it taken.
    update public.survey_templates
       set quota_alert_sent_at = now()
     where id = new.template_id
       and quota_alert_sent_at is null;
    if not found then
      return new;
    end if;

    v_limit := public.survey_response_limit(new.template_id);
    for v_admin in
      select id from public.profiles where role = 'admin' and is_active
    loop
      perform public.notify_from_db(
        'admin.survey_quota_reached',
        v_admin.id,
        jsonb_build_object(
          'survey_title', coalesce(nullif(btrim(v_title), ''), 'A survey'),
          'expected',     v_expected::text,
          'responses',    v_count::text,
          'limit',        coalesce(v_limit, v_expected)::text,
          'buffer_pct',   coalesce(v_buffer, 10)::text),
        '/dashboard/admin/surveys/' || new.template_id::text
      );
    end loop;
  exception when others then
    -- An alert failing must never fail the respondent's submission.
    raise warning 'survey_quota_alert (%): %', new.template_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists survey_responses_quota_alert on public.survey_responses;
create trigger survey_responses_quota_alert
  after insert on public.survey_responses
  for each row execute function public.survey_quota_alert();

-- ---------------------------------------------------------------------------
-- 4. Backfill: surveys already at or over quota stay quiet.
-- ---------------------------------------------------------------------------
update public.survey_templates t
   set quota_alert_sent_at = now()
  from (
    select s.id,
           coalesce(s.expected_participants, f.approx_participants) as expected
      from public.survey_templates s
      left join public.campaign_order_forms f on f.campaign_id = s.campaign_id
     where s.quota_alert_sent_at is null
  ) q
 where t.id = q.id
   and q.expected is not null
   and (select count(*) from public.survey_responses r
         where r.template_id = t.id and r.quality_status <> 'reject') >= q.expected;

-- ---------------------------------------------------------------------------
-- 5. Notification event
-- ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.survey_quota_reached', 'Survey quota reached',
   'A survey reached 100% of its expected participants: a discount code can no longer be guaranteed.',
   'admin', 'The admin team', '{user_name,survey_title,expected,responses,limit,buffer_pct}', 448)
on conflict (key) do nothing;

insert into public.notification_settings (event_key)
select key from public.notification_events
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body) values
  ('admin.survey_quota_reached', 'in_app', 'Quota reached: {{survey_title}} ({{responses}} of {{expected}})',
   '{{survey_title}} has reached 100% of its expected participants ({{responses}} of {{expected}}). Responses are still accepted up to {{limit}}; after that they are held for review. Respondents now see that a discount code isn''t guaranteed.'),
  ('admin.survey_quota_reached', 'email', 'Quota reached: {{survey_title}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{survey_title}} has reached 100% of its expected participants ({{responses}} of {{expected}}).' || chr(10) || chr(10) ||
   'Responses are still accepted up to {{limit}} (the +{{buffer_pct}}% buffer); after that they are held for your review. From now on respondents see an alert that a discount code can''t be guaranteed, and a pop-up asking them to confirm before they submit.' || chr(10) || chr(10) ||
   'If you want to take more responses with codes, raise the expected participants on the survey; you''ll be alerted again when the new target is reached.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
