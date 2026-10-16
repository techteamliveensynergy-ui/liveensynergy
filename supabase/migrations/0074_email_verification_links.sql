-- =============================================================================
-- 0074 — One email-verification flow for every account (client, 16 Oct).
--
-- Before: ordinary sign-ups couldn't sign in until they clicked Supabase's
-- confirmation link, and survey sign-ups were sent Supabase's *reset
-- password* email as their "verification" — whose link fell back to the
-- project's Site URL (localhost) when the redirect wasn't allow-listed. Two
-- flows, both depending on Supabase's mailer and its URL settings.
--
-- Now, for every role except admin (admins are created by the team):
--   * the account is usable straight away — sign up, sign in, onboarding;
--   * we send our own welcome email (Resend, via notify()) with a one-time
--     link: /auth/verify-email?token=…  Opening it marks the address
--     verified and lands the person on their dashboard, signed in;
--   * until then the dashboard is covered by a "confirm your email" overlay
--     with a resend button (middleware + dashboard layout). Onboarding and
--     surveys stay open.
--
-- 1. profiles.email_verified — the yes/no the team asked for. Generated from
--    email_verified_at (0069), so the two can never disagree, and nobody can
--    write it directly.
-- 2. email_verification_tokens — sha-256 of each emailed token (the token
--    itself is never stored), 24h expiry, single use. No policies: only the
--    two definer functions below touch it.
-- 3. issue_email_verification(token_hash) — the signed-in, unverified caller
--    gets a fresh token (older unused ones are dropped, so only the latest
--    email works).
-- 4. verify_email_token(token) — anyone holding a valid token (it may be
--    opened signed out, on another device) verifies that account. Returns
--    the status and, on success, the email so the route can sign them in.
-- 5. signup_gate(ip_hash) — sign-up now creates accounts through the Admin
--    API (no Supabase confirmation step, no Supabase email), which skips
--    Supabase's own sign-up throttle; this is ours: 10 per IP per hour.
-- 6. handle_new_user / sync_email_verified: an account created this way is
--    "confirmed" in auth.users only so it can sign in — that proves nothing
--    about the address (metadata verify_by_link), same as survey accounts.
-- 7. Admins are always verified (backfill).
-- 8. Notification account.verify_email (email only). account.welcome's email
--    is switched off — the verify email *is* the welcome email, so a new
--    sign-up gets one email, not two; the in-app welcome stays.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email_verified boolean
  generated always as (email_verified_at is not null) stored;

-- 7 ---------------------------------------------------------------------------
update public.profiles
   set email_verified_at = coalesce(email_verified_at, created_at, now())
 where role = 'admin' and email_verified_at is null;

-- 2 ---------------------------------------------------------------------------
create table if not exists public.email_verification_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists email_verification_tokens_profile_idx
  on public.email_verification_tokens (profile_id);
alter table public.email_verification_tokens enable row level security;

-- 3 ---------------------------------------------------------------------------
create or replace function public.issue_email_verification(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_token_hash is null or length(p_token_hash) <> 64 then
    return false;
  end if;
  -- Already verified (or an admin): nothing to send.
  if exists (
    select 1 from profiles
     where id = v_uid and (email_verified_at is not null or role = 'admin')
  ) then
    return false;
  end if;
  delete from email_verification_tokens where profile_id = v_uid and used_at is null;
  insert into email_verification_tokens (profile_id, token_hash, expires_at)
  values (v_uid, p_token_hash, now() + interval '24 hours');
  return true;
end;
$$;
revoke all on function public.issue_email_verification(text) from public, anon;
grant execute on function public.issue_email_verification(text) to authenticated;

-- 4 ---------------------------------------------------------------------------
create or replace function public.verify_email_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row     email_verification_tokens%rowtype;
  v_profile record;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_row
    from email_verification_tokens
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
   for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select p.id, p.email, p.email_verified_at, p.onboarding_completed, p.role,
         coalesce((u.raw_user_meta_data ->> 'survey_account')::boolean, false) as survey_account
    into v_profile
    from profiles p join auth.users u on u.id = p.id
   where p.id = v_row.profile_id;

  if v_row.used_at is not null or v_profile.email_verified_at is not null then
    return jsonb_build_object('status', 'already', 'profile_id', v_row.profile_id);
  end if;
  if v_row.expires_at < now() then
    return jsonb_build_object('status', 'expired', 'profile_id', v_row.profile_id);
  end if;

  update email_verification_tokens set used_at = now() where id = v_row.id;
  update profiles set email_verified_at = now() where id = v_row.profile_id;

  return jsonb_build_object(
    'status', 'ok',
    'profile_id', v_row.profile_id,
    'email', v_profile.email,
    'onboarding_completed', v_profile.onboarding_completed,
    'survey_account', v_profile.survey_account
  );
end;
$$;
revoke all on function public.verify_email_token(text) from public;
grant execute on function public.verify_email_token(text) to anon, authenticated;

-- 5 ---------------------------------------------------------------------------
create table if not exists public.signup_attempts (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index if not exists signup_attempts_ip_idx on public.signup_attempts (ip_hash, created_at desc);
alter table public.signup_attempts enable row level security;

create or replace function public.signup_gate(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ip_hash is null then
    return true;
  end if;
  if (select count(*) from signup_attempts
       where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
    return false;
  end if;
  insert into signup_attempts (ip_hash) values (p_ip_hash);
  delete from signup_attempts where created_at < now() - interval '1 day';
  return true;
end;
$$;
revoke all on function public.signup_gate(text) from public;
grant execute on function public.signup_gate(text) to anon, authenticated;

-- 6 ---------------------------------------------------------------------------
-- handle_new_user() and sync_email_verified() both go through this, so
-- redefining it is enough.
create or replace function public.email_confirmation_counts(u auth.users)
returns boolean
language sql
immutable
as $$
  select u.email_confirmed_at is not null
     and coalesce((u.raw_user_meta_data ->> 'survey_account')::boolean, false) = false
     and coalesce((u.raw_user_meta_data ->> 'verify_by_link')::boolean, false) = false;
$$;

-- 8 ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('account.verify_email', 'Welcome — confirm your email',
   'Sent when an account is created (and again from the "send it again" button) with the link that confirms the email address.',
   'account', 'The new user', '{user_name,role_label,verify_link}', 11)
on conflict (key) do nothing;

insert into notification_settings (event_key, in_app_enabled, email_enabled)
values ('account.verify_email', false, true)
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('account.verify_email', 'email', 'Welcome to Live·En·Synergy — please confirm your email',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Welcome to Live·En·Synergy! Your {{role_label}} account is ready.' || chr(10) || chr(10) ||
   'Please confirm this is your email address by opening the link below. It takes you straight to your dashboard:' || chr(10) || chr(10) ||
   '{{verify_link}}' || chr(10) || chr(10) ||
   'The link works once and lasts 24 hours. If it has expired, sign in and press "Send it again" on your dashboard.' || chr(10) || chr(10) ||
   'Didn''t create an account? You can ignore this email.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict do nothing;

update notification_settings set email_enabled = false where event_key = 'account.welcome';

-- 9 ---------------------------------------------------------------------------
-- Sign-in sends the welcome email to an unverified account that has no live
-- link (accounts from before 0074, or whose link expired) — "as soon as he
-- logs in" (16 Oct) — without re-sending on every sign-in.
create or replace function public.email_verification_pending()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from email_verification_tokens
     where profile_id = auth.uid() and used_at is null and expires_at > now()
  );
$$;
revoke all on function public.email_verification_pending() from public, anon;
grant execute on function public.email_verification_pending() to authenticated;
