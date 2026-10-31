-- =============================================================================
-- 0098 — say why a survey is locked; accurate registration notification
-- (QA 30 Oct #20, #22).
--
-- 1. survey_access_reason(template)
--    /dashboard/surveys/[id] showed "This survey isn't available to you" with
--    no reason. The template row is hidden by RLS (0033) from anyone not yet
--    eligible, so the page can't work the reason out itself. This answers
--    for the caller's *own* participation only, and returns one of:
--      null                  eligible (or not an audience account)
--      'unavailable'         no such published survey, or the caller isn't
--                            registered for an event on its campaign — one
--                            answer for both, so a guessed id learns nothing
--      'rejected'            their registration was declined
--      'awaiting_selection'  post-event survey; not selected yet
--      'awaiting_attendance' post-event survey; selected, attendance not yet
--                            verified
--    Mirrors survey_participation_for() (0033), which stays the gate.
--
-- 2. participation.registered wording
--    The confirmation still described the old ticket-reference flow and
--    implied the code follows the survey alone. The code is released once
--    the survey passes *and* the artist has confirmed the discount codes
--    (0075). Every template is rewritten (no record of admin edits exists);
--    the previous text is kept first in notification_templates_pre_0098,
--    admin-read only, same as 0096.
--
-- Re-runnable.
-- =============================================================================

create or replace function survey_access_reason(p_template_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_kind text;
  v_campaign uuid;
  v_best text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'audience') then
    return null;
  end if;
  if survey_participation_for(p_template_id) is not null then
    return null;
  end if;

  select kind, campaign_id into v_kind, v_campaign
    from survey_templates
   where id = p_template_id and status = 'published';
  if v_campaign is null then
    return 'unavailable';
  end if;

  -- The caller's most advanced registration on this campaign decides.
  select case
           when bool_or(p.status <> 'rejected' and p.selected) then 'awaiting_attendance'
           when bool_or(p.status <> 'rejected') then 'awaiting_selection'
           when count(*) > 0 then 'rejected'
         end
    into v_best
    from participations p
    join sponsored_events se on se.id = p.sponsored_event_id
   where se.campaign_id = v_campaign
     and se.status in ('confirmed', 'completed')
     and p.audience_profile_id = auth.uid();

  if v_best is null then
    return 'unavailable';
  end if;
  -- A pre-event survey only needs a live registration, which
  -- survey_participation_for() would already have accepted.
  if v_kind = 'pre_event' and v_best <> 'rejected' then
    return 'unavailable';
  end if;
  return v_best;
end;
$$;

revoke all on function survey_access_reason(uuid) from public;
grant execute on function survey_access_reason(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Registration confirmation wording
-- -----------------------------------------------------------------------------
create table if not exists notification_templates_pre_0098 (
  template_id uuid primary key,
  event_key   text not null,
  channel     text not null,
  subject     text,
  body        text,
  saved_at    timestamptz not null default now()
);
alter table notification_templates_pre_0098 enable row level security;
drop policy if exists "notification_templates_pre_0098: admin read" on notification_templates_pre_0098;
create policy "notification_templates_pre_0098: admin read" on notification_templates_pre_0098
  for select using (is_admin());
grant select on notification_templates_pre_0098 to authenticated;

insert into notification_templates_pre_0098 (template_id, event_key, channel, subject, body)
select id, event_key, channel, subject, body
  from notification_templates
 where event_key = 'participation.registered'
on conflict (template_id) do nothing;

update notification_templates set
  subject = 'You''re registered for {{event_name}}',
  body    = 'You''re registered for {{event_name}}. Next: the Live·En·Synergy team chooses who takes part, '
         || 'and you''ll hear from us if you''re selected. Your discount code is released once your survey '
         || 'passes our quality check and the event''s discount codes have been confirmed. Follow each step under My events.'
where event_key = 'participation.registered' and channel = 'in_app';

update notification_templates set
  subject = 'You''re registered for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'You''re registered for {{event_name}}.' || chr(10) || chr(10) ||
            'What happens next:' || chr(10) ||
            '1. The Live·En·Synergy team chooses who takes part — we''ll email you if you''re selected.' || chr(10) ||
            '2. If you are, attend the event and check in at the venue.' || chr(10) ||
            '3. Answer the short survey under My events — the button appears there as soon as it opens '
         || '(some events ask before the event, some after).' || chr(10) ||
            '4. Your discount code is released once your survey passes our quality check and the event''s '
         || 'discount codes have been confirmed. It appears under My rewards and we email it to you.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participation.registered' and channel = 'email';
