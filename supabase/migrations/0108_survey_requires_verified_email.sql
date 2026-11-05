-- =============================================================================
-- 0108 — a survey response needs a verified email (client note 4 Nov; #63/#72).
--
-- Client test: "I was able to fill out a survey without confirming the email
-- first." General Notes (26 Oct): "email to be verified first".
--
-- Why it was possible. Everything under /dashboard/ already waits for the
-- one-time link in our welcome email (middleware needsVerifiedEmail(), 0069 /
-- 0074). The PUBLIC survey route, /survey/<id>, lives outside /dashboard, and
-- a survey sign-up creates the account and signs it in at once — so an account
-- whose address nobody had proved could answer, be scored, and be issued a code
-- (0075) at an inbox that may be mistyped.
--
-- The app now asks the respondent to confirm their email BEFORE the questions
-- start (so there is nothing to lose while they open the link). This is the
-- server-side backstop: the page alone is not a guard, because the submit RPCs
-- can be called directly. A BEFORE INSERT trigger on survey_responses refuses a
-- response from an unverified account with 'EMAIL_NOT_VERIFIED', the way
-- survey_responses_require_open() (0070) refuses a closed survey.
--
--   - Only responses tied to an account (respondent_profile_id). An anonymous
--     public response has no account, hence no address to verify — and cannot be
--     issued a code (0075 matches codes through the account).
--   - Admins are exempt (profiles.role = 'admin', and an admin session): the
--     "Score now" / data fixes they do must not trip it. So is a caller with no
--     session at all (the service role / cron), as in 0070.
--   - Existing responses are untouched; only new inserts are checked. Existing
--     survey accounts that never verified are asked to when they next submit.
--
-- Additive: one function and one trigger. Safe before or after the code (before:
-- unverified accounts are stopped at submit with a clear message; after: they
-- are also stopped at the start). Re-runnable.
-- =============================================================================
create or replace function public.survey_responses_require_verified_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text;
  v_verified timestamptz;
begin
  if new.respondent_profile_id is null then
    return new;
  end if;
  -- security definer changes current_user, so ask about the real caller.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  select role, email_verified_at into v_role, v_verified
    from public.profiles
   where id = new.respondent_profile_id;
  if not found or v_role = 'admin' or v_verified is not null then
    return new;
  end if;

  -- The survey actions match on this text and show "confirm your email first".
  raise exception 'EMAIL_NOT_VERIFIED: confirm your email address before submitting this survey'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists survey_responses_require_verified_email on public.survey_responses;
create trigger survey_responses_require_verified_email
  before insert on public.survey_responses
  for each row execute function public.survey_responses_require_verified_email();
