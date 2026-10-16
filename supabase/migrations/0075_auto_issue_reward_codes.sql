-- =============================================================================
-- 0075 — Discount codes go out automatically when a survey passes (16 Oct).
--
-- Client, 16 Oct: "after the audience completes the pre-survey, release the
-- coupon codes … the admin only releases for cases below the threshold.
-- Above the threshold, all the audiences get the discount code immediately,
-- also sent to them via an email, and on the dashboard … anytime they want."
--
-- Before: an admin issued every code by hand, and only after attendance was
-- verified at the event. Now a participant whose campaign survey (pre- or
-- post-event) is scored `pass` gets a code at once:
--   * scored `pass` automatically (above the quality threshold) → issued on
--     the spot;
--   * scored `review` (below it) → nothing until an admin approves it in the
--     review queue; that update to `pass` issues it the same way;
--   * `reject` → never.
-- No check-in needed. The code shows on My events and My rewards, and the
-- reward.code_issued email now carries the code itself.
--
-- auto_issue_reward_code(participation) does the work, mirroring
-- issueCodeFromTier() (src/lib/data/reward-codes.ts): tiers in rank order,
-- a capped tier stops at its cap, a shared tier hands out its shared_code, a
-- unique tier takes the oldest unassigned pool code. A code is never made
-- up. It refuses (quietly — returns the reason) when:
--   * the participant already holds a live code;
--   * the artist hasn't confirmed the codes yet (0045 consent);
--   * there's no campaign survey, or this person's response isn't `pass`;
--   * the participation is rejected;
--   * every tier is full / empty.
-- Whatever it skips, the admin's "Issue codes to everyone eligible" catches
-- up later (e.g. after the artist confirms, or a pool is topped up).
--
-- Fired from three triggers so no path is missed:
--   * survey_responses → quality_status becomes 'pass' (scoring, admin
--     approval, bulk approval, re-score);
--   * participations insert (a public-survey respondent who registers after
--     answering);
--   * sponsored_events.reward_codes_confirmed_at set (artist consents after
--     people already passed).
-- A trigger failure must never undo the survey answer or the registration,
-- so each trigger swallows errors (logged as a warning).
--
-- The email is queued straight into email_outbox through
-- enqueue_notification(), rendering the admin-edited templates the same way
-- notify() does; the 5-minute drain (pg_cron) sends it.
-- =============================================================================

-- {{token}} substitution, same rule as renderTemplate() in
-- src/lib/notifications.ts: an unknown or empty token stays visible.
create or replace function public.render_notification_tokens(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_out text := p_text;
  v_key text;
  v_val text;
begin
  if p_text is null then
    return null;
  end if;
  for v_key, v_val in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    if v_val is not null and v_val <> '' then
      v_out := regexp_replace(v_out, '\{\{\s*' || v_key || '\s*\}\}', replace(v_val, '\', '\\'), 'g');
    end if;
  end loop;
  return v_out;
end;
$$;

-- notify() for a caller with no TypeScript around it: settings + templates +
-- the recipient's email, rendered, into enqueue_notification().
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
    case when v_settings.in_app_enabled then p_link end,
    case when v_settings.email_enabled and v_email.subject is not null then v_profile.email end,
    case when v_settings.email_enabled then v_settings.email_cc end,
    case when v_settings.email_enabled then v_settings.email_bcc end,
    case when v_settings.email_enabled then render_notification_tokens(v_email.subject, v_vars) end,
    case when v_settings.email_enabled then render_notification_tokens(v_email.body, v_vars) end
  );
end;
$$;
revoke all on function public.notify_from_db(text, uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.auto_issue_reward_code(p_participation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part   participations%rowtype;
  v_ev     sponsored_events%rowtype;
  v_status text;
  v_tier   sponsored_event_reward_tiers%rowtype;
  v_pool   record;
  v_code   text;
  v_code_id uuid;
  v_value  text;
begin
  select * into v_part from participations where id = p_participation_id;
  if not found or v_part.status = 'rejected' then
    return jsonb_build_object('issued', false, 'reason', 'status');
  end if;

  select * into v_ev from sponsored_events where id = v_part.sponsored_event_id;
  if v_ev.campaign_id is null then
    -- No campaign → no survey to pass; stays an admin decision.
    return jsonb_build_object('issued', false, 'reason', 'no_survey');
  end if;
  if v_ev.artist_profile_id is not null and v_ev.reward_codes_confirmed_at is null then
    return jsonb_build_object('issued', false, 'reason', 'not_confirmed');
  end if;

  -- The person's latest response to any of this campaign's surveys —
  -- answered from the dashboard (participation_id) or the public link
  -- (respondent_profile_id, 0043).
  select r.quality_status into v_status
    from survey_responses r
    join survey_templates t on t.id = r.template_id
   where t.campaign_id = v_ev.campaign_id
     and t.status in ('published', 'archived')
     and (r.participation_id = v_part.id or r.respondent_profile_id = v_part.audience_profile_id)
   order by (r.quality_status = 'pass') desc, r.submitted_at desc
   limit 1;
  if v_status is null then
    return jsonb_build_object('issued', false, 'reason', 'missing');
  end if;
  if v_status <> 'pass' then
    return jsonb_build_object('issued', false, 'reason', v_status);
  end if;

  -- One issuer per event at a time, so caps and pools can't be overrun by
  -- two passes landing together.
  perform pg_advisory_xact_lock(hashtext('reward_issue:' || v_ev.id::text));

  if exists (
    select 1 from reward_codes
     where participation_id = v_part.id and status <> 'void'
  ) then
    return jsonb_build_object('issued', false, 'reason', 'already');
  end if;

  for v_tier in
    select * from sponsored_event_reward_tiers
     where sponsored_event_id = v_ev.id
     order by rank, created_at
  loop
    if v_tier.participant_cap is not null and (
      select count(*) from reward_codes where tier_id = v_tier.id and status <> 'void'
    ) >= v_tier.participant_cap then
      continue;
    end if;

    v_value := coalesce(
      v_tier.value_label,
      case when v_tier.discount_percent is not null then trim(to_char(v_tier.discount_percent, 'FM999990.##')) || '% off' end,
      case when v_tier.value_gbp is not null then '£' || trim(to_char(v_tier.value_gbp, 'FM999,999,990.##')) || ' off' end,
      case when v_tier.code_type = 'merch' then 'Merchandise code' else 'Discount code' end
    );

    if v_tier.distribution_model = 'shared' then
      if v_tier.shared_code is null then
        continue;
      end if;
      v_code := v_tier.shared_code;
      insert into reward_codes (
        code, sponsored_event_id, participation_id, tier_id, code_type, value_label, value_gbp,
        redemption_platform, redemption_url, redemption_instructions, expires_at, is_shared, issued_by
      ) values (
        v_code, v_ev.id, v_part.id, v_tier.id, coalesce(v_tier.code_type, 'discount')::reward_code_type,
        v_value, v_tier.value_gbp, v_tier.redemption_platform, v_tier.redemption_url,
        v_tier.redemption_instructions,
        case when v_tier.valid_until is not null then (v_tier.valid_until::text || 'T23:59:59Z')::timestamptz end,
        true, null
      );
      exit;
    end if;

    select id, code, external_ref into v_pool
      from reward_code_pool
     where tier_id = v_tier.id and assigned_at is null
     order by created_at, id
     limit 1
     for update skip locked;
    if not found then
      continue;
    end if;
    v_code := v_pool.code;
    insert into reward_codes (
      code, sponsored_event_id, participation_id, tier_id, code_type, value_label, value_gbp,
      redemption_platform, redemption_url, redemption_instructions, expires_at, is_shared,
      external_ref, issued_by
    ) values (
      v_code, v_ev.id, v_part.id, v_tier.id, coalesce(v_tier.code_type, 'discount')::reward_code_type,
      v_value, v_tier.value_gbp, v_tier.redemption_platform, v_tier.redemption_url,
      v_tier.redemption_instructions,
      case when v_tier.valid_until is not null then (v_tier.valid_until::text || 'T23:59:59Z')::timestamptz end,
      false, v_pool.external_ref, null
    ) returning id into v_code_id;
    update reward_code_pool set assigned_at = now(), assigned_code_id = v_code_id where id = v_pool.id;
    exit;
  end loop;

  if v_code is null then
    return jsonb_build_object('issued', false, 'reason', 'no_codes');
  end if;

  -- After the event, issuing completes a checked-in participation (as the
  -- admin path does); before it, the row stays registered.
  update participations
     set status = 'reward_released', reward_released_at = now()
   where id = v_part.id and status = 'attendance_verified';

  perform notify_from_db(
    'reward.code_issued',
    v_part.audience_profile_id,
    jsonb_build_object('event_name', v_ev.name, 'code', v_code, 'value_label', v_value),
    '/dashboard/rewards'
  );

  return jsonb_build_object('issued', true, 'code', v_code);
end;
$$;
-- Only the triggers below run it (as the owner); nobody calls it directly.
revoke all on function public.auto_issue_reward_code(uuid) from public, anon, authenticated;

-- Triggers --------------------------------------------------------------------

create or replace function public.reward_issue_on_survey_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
begin
  if new.quality_status <> 'pass' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.quality_status = 'pass' then
    return new;
  end if;
  begin
    for v_pid in
      select p.id
        from participations p
        join sponsored_events se on se.id = p.sponsored_event_id
        join survey_templates t on t.campaign_id = se.campaign_id
       where t.id = new.template_id
         and (p.id = new.participation_id
              or (new.respondent_profile_id is not null and p.audience_profile_id = new.respondent_profile_id))
    loop
      perform auto_issue_reward_code(v_pid);
    end loop;
  exception when others then
    raise warning 'auto_issue_reward_code (survey %) failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace trigger survey_responses_issue_reward
  after insert or update of quality_status on survey_responses
  for each row execute function public.reward_issue_on_survey_pass();

create or replace function public.reward_issue_on_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform auto_issue_reward_code(new.id);
  exception when others then
    raise warning 'auto_issue_reward_code (participation %) failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace trigger participations_issue_reward
  after insert on participations
  for each row execute function public.reward_issue_on_registration();

create or replace function public.reward_issue_on_codes_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
begin
  if new.reward_codes_confirmed_at is null or old.reward_codes_confirmed_at is not null then
    return new;
  end if;
  begin
    for v_pid in
      select id from participations
       where sponsored_event_id = new.id and status <> 'rejected'
       order by created_at
    loop
      perform auto_issue_reward_code(v_pid);
    end loop;
  exception when others then
    raise warning 'auto_issue_reward_code (event %) failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace trigger sponsored_events_issue_rewards
  after update of reward_codes_confirmed_at on sponsored_events
  for each row execute function public.reward_issue_on_codes_confirmed();

revoke all on function public.reward_issue_on_survey_pass() from public, anon, authenticated;
revoke all on function public.reward_issue_on_registration() from public, anon, authenticated;
revoke all on function public.reward_issue_on_codes_confirmed() from public, anon, authenticated;
revoke all on function public.render_notification_tokens(text, jsonb) from public, anon;

-- The email now carries the code. Only rewritten while it's still the
-- original wording, so an admin's own edit is kept.
update notification_templates
   set subject = 'Your discount code for {{event_name}} · Live·En·Synergy',
       body = 'Hi {{user_name}},' || chr(10) || chr(10) ||
              'Thanks for completing the survey for {{event_name}}. Here is your discount code:' || chr(10) || chr(10) ||
              '{{code}}  ({{value_label}})' || chr(10) || chr(10) ||
              'You can see it any time under My events and My rewards on your dashboard, along with where and how to use it.' || chr(10) || chr(10) ||
              '— The Live·En·Synergy team'
 where event_key = 'reward.code_issued' and channel = 'email'
   and body = 'Hi {{user_name}},' || chr(10) || chr(10) || 'A discount or merch code was issued to you.' || chr(10) || chr(10) || '— The Live·En·Synergy team';

update notification_templates
   set subject = 'Your discount code for {{event_name}}',
       body = '{{code}} — {{value_label}}. It''s saved under My rewards.'
 where event_key = 'reward.code_issued' and channel = 'in_app'
   and body = 'A discount or merch code was issued to you.';
