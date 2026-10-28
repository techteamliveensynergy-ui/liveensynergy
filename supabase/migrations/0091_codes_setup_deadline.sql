-- =============================================================================
-- 0091 — a deadline for setting up discount codes (GitHub #58).
--
-- Sakshi's Artist/Organiser Fulfilment Form: the artist has one week from
-- the form's creation to configure and confirm the event's discount codes.
-- Nothing recorded a deadline, so nothing could remind anyone.
--
-- sponsored_events gains:
--   codes_due_at                 when the artist should have confirmed codes
--   codes_reminder_sent_at       the "due in 2 days" reminder went to the artist
--   codes_overdue_alert_sent_at  the "codes overdue" alert went to admins
--
-- Default: created_at + 7 days, but never later than 23:59 two days before
-- the event in its own zone — codes have to be loaded into the ticketing
-- platform before the doors open. Set on insert by a trigger. A brand or
-- artist (untrusted writer, 0061) can't choose or move it; admins and the
-- service role can. The reminder columns are written only by
-- /api/cron/code-deadlines with the service client.
--
-- Late confirmation isn't blocked: confirm_reward_codes() (0045) is
-- unchanged, and "confirmed late" is derived (reward_codes_confirmed_at >
-- codes_due_at).
--
-- Backfill: open, unconfirmed events with an artist whose event is still
-- ahead get a fresh week from today (capped the same way), so nothing is
-- overdue the moment this is applied. Everything else stays null and shows
-- no deadline unless an admin sets one.
--
-- Two new notifications (catalogue + settings + templates, CLAUDE.md):
--   sponsorship.codes_due_soon  → the artist, 2 days before
--   admin.codes_overdue         → every admin, on the deadline
--
-- Additive. Apply before deploying the code (the pages read codes_due_at).
-- =============================================================================

alter table sponsored_events
  add column if not exists codes_due_at                timestamptz,
  add column if not exists codes_reminder_sent_at      timestamptz,
  add column if not exists codes_overdue_alert_sent_at timestamptz;

create or replace function public.default_codes_due_at(
  p_from timestamptz, p_event_date date, p_timezone text
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_event_date is null then p_from + interval '7 days'
    else least(
      p_from + interval '7 days',
      ((p_event_date - 2)::timestamp + time '23:59') at time zone coalesce(p_timezone, 'Europe/London')
    )
  end
$$;

-- Not definer: is_untrusted_writer() reads current_user, which must be the
-- caller's role.
create or replace function public.sponsored_events_codes_due()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.artist_profile_id is not null
       and (new.codes_due_at is null or public.is_untrusted_writer()) then
      new.codes_due_at := public.default_codes_due_at(coalesce(new.created_at, now()), new.event_date, new.timezone);
    end if;
    if public.is_untrusted_writer() then
      new.codes_reminder_sent_at := null;
      new.codes_overdue_alert_sent_at := null;
    end if;
    return new;
  end if;

  if public.is_untrusted_writer() and (
       new.codes_due_at is distinct from old.codes_due_at
       or new.codes_reminder_sent_at is distinct from old.codes_reminder_sent_at
       or new.codes_overdue_alert_sent_at is distinct from old.codes_overdue_alert_sent_at) then
    raise exception 'Only the team can change the discount code deadline' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger sponsored_events_codes_due
  before insert or update on public.sponsored_events
  for each row execute function public.sponsored_events_codes_due();

update sponsored_events se
   set codes_due_at = public.default_codes_due_at(now(), se.event_date, se.timezone)
 where se.codes_due_at is null
   and se.artist_profile_id is not null
   and se.reward_codes_confirmed_at is null
   and se.status in ('in_progress', 'confirmed')
   and (se.event_date is null
        or se.event_date > (now() at time zone coalesce(se.timezone, 'Europe/London'))::date + 2);

insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('sponsorship.codes_due_soon', 'Discount codes due soon',
   'The discount codes for a sponsored event still need confirming, two days before the deadline.',
   'artist', 'The artist / organiser', '{user_name,event_name,due_on}', 236),
  ('admin.codes_overdue', 'Discount codes overdue',
   'An artist has not confirmed a sponsored event''s discount codes by the deadline.',
   'admin', 'The admin team', '{user_name,event_name,event_reference,due_on}', 445)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('sponsorship.codes_due_soon', 'in_app', 'Confirm the discount codes for {{event_name}} by {{due_on}}',
   'The discount codes for {{event_name}} are due by {{due_on}}. Review them and confirm on the sponsored event page.'),
  ('sponsorship.codes_due_soon', 'email', 'Discount codes for {{event_name}} due {{due_on}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'The discount codes for {{event_name}} need to be set up and confirmed by {{due_on}}, so attendees can use them when they book. Open the sponsored event in your dashboard to review and confirm them.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.codes_overdue', 'in_app', 'Discount codes overdue: {{event_name}} ({{event_reference}})',
   'The artist hasn''t confirmed the discount codes for {{event_name}} ({{event_reference}}). They were due {{due_on}}.'),
  ('admin.codes_overdue', 'email', 'Discount codes overdue: {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'The artist hasn''t confirmed the discount codes for {{event_name}} ({{event_reference}}). They were due {{due_on}}. Follow up with them, or change the deadline on the admin sponsored event page.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
