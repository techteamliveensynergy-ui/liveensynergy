-- =============================================================================
-- 0096 — "Sponsor" → "Partner" in notification wording (GitHub #46).
--
-- Sakshi's General Notes (26 Oct): wherever "Sponsor(ed)" appears, it becomes
-- "Partner(ed)". The UI copy changes in code; notification wording lives in
-- rows, so it changes here:
--   notification_templates  subject + body (in-app and email)
--   notification_events     name + description (the admin's catalogue)
--
-- Word for word, case kept: Sponsor → Partner, Sponsors → Partners,
-- Sponsored → Partnered, Sponsoring → Partnering, Sponsorship(s) →
-- Partnership(s). Whole words only (\m…\M), so event keys like
-- 'sponsorship.confirmed' (the key column isn't touched anyway) and tokens
-- like {{sponsor_name}} stay as they are.
--
-- There is no record of which templates an admin has edited, so every row
-- that uses the word is changed — the client asked for it everywhere — and
-- each row's previous text is kept first in notification_templates_pre_0096
-- so an edited template can be compared and restored. Admin-only table.
--
-- Not changed: emails already in email_outbox (they were sent with the old
-- wording), the consent log (consents were given to the old wording), table,
-- column and key names, and error messages raised inside database functions
-- (follow-up, they need the functions redefined).
--
-- Safe to re-run: the backup keeps the first copy, and a second pass finds
-- nothing left to replace.
-- =============================================================================

create or replace function pg_temp.partner_words(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(t,
    '\mSponsorships\M', 'Partnerships', 'g'),
    '\msponsorships\M', 'partnerships', 'g'),
    '\mSponsorship\M',  'Partnership',  'g'),
    '\msponsorship\M',  'partnership',  'g'),
    '\mSponsored\M',    'Partnered',    'g'),
    '\msponsored\M',    'partnered',    'g'),
    '\mSponsoring\M',   'Partnering',   'g'),
    '\msponsoring\M',   'partnering',   'g'),
    '\mSponsors\M',     'Partners',     'g'),
    '\msponsors\M',     'partners',     'g'),
    '\mSponsor\M',      'Partner',      'g'),
    '\msponsor\M',      'partner',      'g')
$$;

create table if not exists notification_templates_pre_0096 (
  template_id uuid primary key,
  event_key   text not null,
  channel     text not null,
  subject     text,
  body        text,
  saved_at    timestamptz not null default now()
);
alter table notification_templates_pre_0096 enable row level security;
drop policy if exists "notification_templates_pre_0096: admin read" on notification_templates_pre_0096;
create policy "notification_templates_pre_0096: admin read" on notification_templates_pre_0096
  for select using (is_admin());
grant select on notification_templates_pre_0096 to authenticated;

insert into notification_templates_pre_0096 (template_id, event_key, channel, subject, body)
select id, event_key, channel, subject, body
  from notification_templates
 where coalesce(subject, '') ~* '\msponsor' or coalesce(body, '') ~* '\msponsor'
on conflict (template_id) do nothing;

update notification_templates
   set subject = pg_temp.partner_words(subject),
       body    = pg_temp.partner_words(body)
 where coalesce(subject, '') ~* '\msponsor' or coalesce(body, '') ~* '\msponsor';

update notification_events
   set name        = pg_temp.partner_words(name),
       description = pg_temp.partner_words(description)
 where coalesce(name, '') ~* '\msponsor' or coalesce(description, '') ~* '\msponsor';
