-- =============================================================================
-- 0122 — (1) our own "sign in" email, (2) no 10% survey buffer
-- (client, 17 Nov).
--
-- 1. Password-reset and sign-in emails must be ours (branded, from the outbox),
--    never Supabase's. 0117 made the reset email ours; the survey's "email me a
--    link to sign in" still used Supabase's. `account.sign_in_link` is the new
--    email: its link signs the person in (an Admin-API magic link redeemed by
--    /auth/callback) and returns them to where they were. Editable by admins
--    at /dashboard/admin/notifications like every other email.
--
-- 2. "Close that 10% buffer": a survey's limit is the expected number of
--    participants, no extra on top. survey_response_limit() (0056) stops adding
--    survey_templates.response_buffer_pct; the column stays (unused, default 0)
--    so nothing that reads it breaks. Everything that reads the cap — the page
--    notices, the over-capacity hold for review (0083), the quota alert — goes
--    through that one function.
--
-- Additive and re-runnable.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('account.sign_in_link', 'Sign-in link',
   'Sent when someone asks for an emailed link to sign in (for example from a survey): the link signs them in and returns them to the page they were on. Works on any device; it works once.',
   'account', 'The user', '{user_name,sign_in_link,link}', 71)
on conflict (key) do nothing;

insert into public.notification_settings (event_key, in_app_enabled, email_enabled)
values ('account.sign_in_link', false, true)
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body) values
  ('account.sign_in_link', 'email', 'Your Live·En·Synergy sign-in link',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Someone (hopefully you) asked for a link to sign in to your Live·En·Synergy account.' || chr(10) || chr(10) ||
   'Open this link to sign in:' || chr(10) || chr(10) ||
   '{{sign_in_link}}' || chr(10) || chr(10) ||
   'The link works once and lasts one hour. If it has expired, ask for a new one from the page you were on.' || chr(10) || chr(10) ||
   'Didn''t ask for this? You can ignore this email — nobody can get in without the link.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;

-- 2 ---------------------------------------------------------------------------
alter table public.survey_templates alter column response_buffer_pct set default 0;

create or replace function public.survey_response_limit(p_template_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.expected_participants, f.approx_participants)
    from public.survey_templates t
    left join public.campaign_order_forms f on f.campaign_id = t.campaign_id
   where t.id = p_template_id
$$;
revoke all on function public.survey_response_limit(uuid) from public;
grant execute on function public.survey_response_limit(uuid) to anon, authenticated, service_role;

-- 3 ---------------------------------------------------------------------------
-- Clean one-time links (client, 17 Nov: "pages that take the reset-password
-- link, take out the URL parameters"). The email carries /auth/link/<token>:
-- a short opaque token with no query string. The token's sha-256 is stored
-- here with the Supabase one-time token it stands for; opening the page
-- shows a "Continue" button and only pressing it redeems the link — so a mail
-- scanner that opens every link in an email can't use it up. Service-role only:
-- no policies and no grants for anyone else.
create table if not exists public.auth_links (
  token_sha256        text primary key check (char_length(token_sha256) = 64),
  link_type           text not null check (link_type in ('recovery', 'magiclink')),
  supabase_token_hash text not null,
  next_path           text not null check (char_length(next_path) <= 500),
  profile_id          uuid references public.profiles (id) on delete cascade,
  expires_at          timestamptz not null,
  used_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists auth_links_expires_idx on public.auth_links (expires_at);
alter table public.auth_links enable row level security;
revoke all on public.auth_links from public, anon, authenticated;
grant all on public.auth_links to service_role;
