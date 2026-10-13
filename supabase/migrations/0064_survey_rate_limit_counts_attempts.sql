-- =============================================================================
-- Live-En-Synergy — survey rate limit counts real attempts only
--
-- Client feedback FB-00034 (12 Oct): after one failed survey submission and a
-- refresh, the respondent was told "Too many submission attempts". The gate
-- (0034) counted EVERY row in survey_submission_attempts against the limit
-- (5 per 10 minutes per account): its own 'allowed' row, the separate
-- 'captcha_missing'/'captcha_failed' row the action logs when the bot check
-- fails, and even its own 'rate_limited' rows. So each Submit click cost two
-- slots, three clicks locked the respondent out, and every retry during the
-- lockout pushed the window further out.
--
-- Now only 'allowed' rows count — one per genuine pass through the gate. The
-- other outcomes are still recorded (they're the audit trail) but no longer
-- charged. A bot hammering the endpoint is still stopped at exactly the same
-- thresholds: each of its passes writes an 'allowed' row.
--
-- Body otherwise verbatim from 0034 (the current definition — 0037 only added
-- an anon grant). Same signature, so `create or replace` keeps both grants.
-- =============================================================================

create or replace function survey_submission_gate(
  p_template_id           uuid,
  p_ip_hash               text,
  p_account_short_minutes int default 10,
  p_account_short_max     int default 5,
  p_account_long_max      int default 20,   -- per rolling 24h
  p_ip_short_minutes      int default 10,
  p_ip_short_max          int default 20,
  p_ip_long_max           int default 100   -- per rolling 24h
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id    uuid := auth.uid();
  v_account_short int := 0;
  v_account_long  int := 0;
  v_ip_short      int := 0;
  v_ip_long       int := 0;
  v_allowed       boolean := true;
  v_reason        text := null;
begin
  if v_profile_id is not null then
    select
      count(*) filter (where created_at > now() - (p_account_short_minutes || ' minutes')::interval),
      count(*) filter (where created_at > now() - interval '24 hours')
      into v_account_short, v_account_long
    from survey_submission_attempts
    where profile_id = v_profile_id
      and outcome = 'allowed';

    if v_account_short >= p_account_short_max or v_account_long >= p_account_long_max then
      v_allowed := false;
      v_reason := 'account';
    end if;
  end if;

  if v_allowed and p_ip_hash is not null then
    select
      count(*) filter (where created_at > now() - (p_ip_short_minutes || ' minutes')::interval),
      count(*) filter (where created_at > now() - interval '24 hours')
      into v_ip_short, v_ip_long
    from survey_submission_attempts
    where ip_hash = p_ip_hash
      and outcome = 'allowed';

    if v_ip_short >= p_ip_short_max or v_ip_long >= p_ip_long_max then
      v_allowed := false;
      v_reason := 'ip';
    end if;
  end if;

  -- Count-then-insert, in that order, so this attempt doesn't count against
  -- its own threshold.
  insert into survey_submission_attempts (profile_id, template_id, ip_hash, outcome)
  values (v_profile_id, p_template_id, p_ip_hash, case when v_allowed then 'allowed' else 'rate_limited' end);

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'account_short', v_account_short,
    'account_long', v_account_long,
    'ip_short', v_ip_short,
    'ip_long', v_ip_long
  );
end;
$$;
