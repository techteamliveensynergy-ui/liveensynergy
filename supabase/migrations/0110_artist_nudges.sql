-- =============================================================================
-- 0110 — "Nudge artist" from the admin Waiting-on-artists tab.
--
-- The tab (/dashboard/admin/artist-pending) lists what each artist still owes on
-- an open sponsorship: agree to it, consent to the fulfilment form, confirm the
-- discount codes. Each item has a "Nudge" button that sends the artist a
-- reminder (in-app + email) saying exactly which thing is waiting.
--
-- Two additions, both additive and re-runnable:
--
-- 1. artist_nudges — one row per reminder sent (event, which item, who sent it,
--    when). It is the audit trail ("who chased whom, when") and what stops a
--    reminder going out twice in a row: the action refuses a second nudge for
--    the same event + item within 12 hours, and the tab shows "Last nudged 3h
--    ago". Admin-only under RLS: an artist never sees the log of reminders.
--
-- 2. One notification event, sponsorship.artist_nudge, with its settings row and
--    in-app + email templates (notify() no-ops silently on an unseeded key, so
--    all three rows land together — same pattern as 0104). The wording is
--    generic over {{what}} / {{detail}}, so one event serves all three items;
--    editable at /dashboard/admin/notifications like any other.
--
-- Safe before or after the code: before this migration the button reports that
-- reminders aren't set up yet instead of pretending to send.
-- =============================================================================
create table if not exists public.artist_nudges (
  id                   uuid primary key default gen_random_uuid(),
  sponsored_event_id   uuid not null references public.sponsored_events (id) on delete cascade,
  kind                 text not null check (kind in ('agreement', 'fulfilment', 'codes')),
  artist_profile_id    uuid references public.profiles (id) on delete set null,
  sent_by              uuid references public.profiles (id) on delete set null,
  sent_at              timestamptz not null default now()
);

create index if not exists artist_nudges_event_kind_idx
  on public.artist_nudges (sponsored_event_id, kind, sent_at desc);

alter table public.artist_nudges enable row level security;

drop policy if exists "artist_nudges: admin all" on public.artist_nudges;
create policy "artist_nudges: admin all" on public.artist_nudges
  for all using (is_admin()) with check (is_admin());

grant select, insert on public.artist_nudges to authenticated;

-- Notification: one event, three kinds of reminder.
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('sponsorship.artist_nudge', 'Reminder from the team',
   'A reminder sent by the team from the Waiting-on-artists tab: one thing is waiting on the artist before the partnership can move on.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference,what,detail}', 239)
on conflict (key) do nothing;

insert into public.notification_settings (event_key)
select key from public.notification_events where key = 'sponsorship.artist_nudge'
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select 'sponsorship.artist_nudge', 'in_app', 'Reminder: {{what}} for {{event_name}}',
       'The Live·En·Synergy team is waiting for you to {{what}} for {{event_name}} ({{reference}}). {{detail}}'
where not exists (
  select 1 from public.notification_templates t
   where t.event_key = 'sponsorship.artist_nudge' and t.channel = 'in_app'
);

insert into public.notification_templates (event_key, channel, subject, body)
select 'sponsorship.artist_nudge', 'email', 'Reminder: {{what}} for {{event_name}} · Live·En·Synergy',
       'Hi {{user_name}},' || chr(10) || chr(10) ||
       'A quick reminder from the Live·En·Synergy team: we''re waiting for you to {{what}} for {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
       '{{detail}}' || chr(10) || chr(10) ||
       'It only takes a minute — open the partnership in your dashboard and it''s the next step there.' || chr(10) || chr(10) ||
       '— The Live·En·Synergy team'
where not exists (
  select 1 from public.notification_templates t
   where t.event_key = 'sponsorship.artist_nudge' and t.channel = 'email'
);
