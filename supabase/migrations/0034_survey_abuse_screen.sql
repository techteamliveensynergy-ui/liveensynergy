-- =============================================================================
-- Live-En-Synergy — survey bot/fraud screen (Phase 3, Step 3)
--
-- Gates src/app/dashboard/surveys/[templateId]/actions.ts's
-- submitSurveyResponse() before it ever calls submit_survey_response() — see
-- the TODO(survey-stage-1) comment that marked this seam. Three checks,
-- cheapest/most-conclusive first: honeypot (free, no I/O), rate limit (one
-- RPC), Turnstile (the only outbound network call in the whole pipeline).
--
-- survey_submission_attempts doubles as the audit log the build plan's §04
-- requires for logged hard-fraud outcomes ("counted in the campaign's
-- statistics, but no reviewer sees it") and the rate limiter's own storage —
-- a Redis-backed limiter would still need this table for the audit trail, so
-- Postgres isn't a compromise here, it's the only thing actually required.
-- =============================================================================

create table survey_submission_attempts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references profiles (id) on delete set null,
  template_id uuid references survey_templates (id) on delete set null,
  -- Salted SHA-256 of the caller's IP (see callerIpHash() in
  -- src/lib/survey-abuse.ts) — never the raw address, since an IP is
  -- personal data and equality-matching over a hash is all a rate limiter
  -- needs.
  ip_hash     text,
  outcome     text not null check (outcome in (
                'allowed', 'honeypot', 'rate_limited',
                'captcha_missing', 'captcha_failed'
              )),
  -- Cloudflare's error-codes array, or which window tripped the limit.
  -- Diagnostics for the audit trail, never read by logic.
  detail      text,
  created_at  timestamptz not null default now()
);
create index on survey_submission_attempts (profile_id, created_at desc);
create index on survey_submission_attempts (ip_hash, created_at desc);
create index on survey_submission_attempts (template_id, created_at desc);

alter table survey_submission_attempts enable row level security;

-- Admin-only read; deliberately no insert policy for anyone — writes go
-- through the security-definer functions below. A respondent-insert policy
-- couldn't restrict which *columns* get set (same reasoning as 0033's note
-- on survey_responses), which would let a client dilute its own rate-limit
-- window by writing outcome = 'allowed' rows directly.
create policy "survey_submission_attempts: admin manage"
  on survey_submission_attempts for all using (is_admin()) with check (is_admin());

-- -----------------------------------------------------------------------------
-- Counts the caller's recent attempts (by account and by IP, each over a
-- short burst window and a 24h daily cap), records this one, and reports
-- whether it may proceed. Not serialised — this is a throttle, not a
-- uniqueness guarantee (submit_survey_response()'s own unique index is that
-- guarantee), so a couple of requests slipping through a race is an
-- acceptable trade for one round trip.
-- -----------------------------------------------------------------------------
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
    where profile_id = v_profile_id;

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
    where ip_hash = p_ip_hash;

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

grant execute on function survey_submission_gate(uuid, text, int, int, int, int, int, int) to authenticated;

-- Insert-only logger for outcomes the gate itself never sees (honeypot,
-- Turnstile failure) — kept separate so those paths don't need to reason
-- about the counting logic above at all.
create or replace function log_survey_attempt(
  p_template_id uuid,
  p_ip_hash     text,
  p_outcome     text,
  p_detail      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into survey_submission_attempts (profile_id, template_id, ip_hash, outcome, detail)
  values (auth.uid(), p_template_id, p_ip_hash, p_outcome, p_detail);
end;
$$;

grant execute on function log_survey_attempt(uuid, text, text, text) to authenticated;
