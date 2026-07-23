-- =============================================================================
-- Live-En-Synergy — notifications (in-app + email)
--
-- Design (see docs/admin-plan1.md):
--   * Every notifiable thing is an *event* with a stable key, seeded here.
--   * Admin toggles the in-app and email channels per event, edits templates,
--     and sets always-CC addresses — all without a deploy.
--   * Email is written to an outbox with status 'queued'. Wiring a real
--     provider later means draining that table; no call site changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table notification_events (
  key          text primary key,
  name         text not null,
  description  text,
  category     text not null,          -- account | brand | artist | audience | messaging | admin
  audience     text,                   -- plain-English "who gets this"
  variables    text[] not null default '{}',
  sort_order   integer not null default 0
);

create table notification_settings (
  event_key       text primary key references notification_events (key) on delete cascade,
  in_app_enabled  boolean not null default true,
  email_enabled   boolean not null default true,
  email_cc        text[],
  email_bcc       text[],
  updated_by      uuid references profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

create table notification_templates (
  id         uuid primary key default gen_random_uuid(),
  event_key  text not null references notification_events (key) on delete cascade,
  channel    text not null check (channel in ('in_app', 'email')),
  subject    text,                     -- email subject / in-app title
  body       text,
  updated_at timestamptz not null default now(),
  unique (event_key, channel)
);
create trigger notification_templates_set_updated_at
  before update on notification_templates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------
create table notifications (
  id                   uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references profiles (id) on delete cascade,
  event_key            text,
  title                text not null,
  body                 text,
  link                 text,
  read_at              timestamptz,
  created_at           timestamptz not null default now()
);
create index notifications_recipient_idx
  on notifications (recipient_profile_id, read_at, created_at desc);

create table email_outbox (
  id                   uuid primary key default gen_random_uuid(),
  to_email             text not null,
  cc                   text[],
  bcc                  text[],
  subject              text,
  body                 text,
  event_key            text,
  recipient_profile_id uuid references profiles (id) on delete set null,
  status               text not null default 'queued'
                         check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider             text,
  provider_message_id  text,
  error                text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);
create index email_outbox_status_idx on email_outbox (status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
--   Catalogue/settings/templates are readable by any signed-in user because
--   notify() renders with them at call time; only admins may change them.
-- ---------------------------------------------------------------------------
alter table notification_events    enable row level security;
alter table notification_settings  enable row level security;
alter table notification_templates enable row level security;
alter table notifications          enable row level security;
alter table email_outbox           enable row level security;

create policy "notification_events: read" on notification_events
  for select to authenticated using (true);
create policy "notification_events: admin manage" on notification_events
  for all using (is_admin()) with check (is_admin());

create policy "notification_settings: read" on notification_settings
  for select to authenticated using (true);
create policy "notification_settings: admin manage" on notification_settings
  for all using (is_admin()) with check (is_admin());

create policy "notification_templates: read" on notification_templates
  for select to authenticated using (true);
create policy "notification_templates: admin manage" on notification_templates
  for all using (is_admin()) with check (is_admin());

-- Recipients read and mark their own; admins can see everything.
create policy "notifications: own read" on notifications
  for select using (recipient_profile_id = auth.uid() or is_admin());
create policy "notifications: own update" on notifications
  for update using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

-- The outbox is an admin audit log. Rows are written by the definer function
-- below, never directly by a client.
create policy "email_outbox: admin read" on email_outbox
  for select using (is_admin());

-- ---------------------------------------------------------------------------
-- Writing a notification targets *another* user, so it can't go through the
-- recipient-scoped policies. This definer function is the only writer.
-- ---------------------------------------------------------------------------
create or replace function enqueue_notification(
  p_event_key     text,
  p_recipient     uuid,
  p_in_app_title  text default null,
  p_in_app_body   text default null,
  p_link          text default null,
  p_email_to      text default null,
  p_email_cc      text[] default null,
  p_email_bcc     text[] default null,
  p_email_subject text default null,
  p_email_body    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_in_app_title is not null then
    insert into public.notifications
      (recipient_profile_id, event_key, title, body, link)
    values (p_recipient, p_event_key, p_in_app_title, p_in_app_body, p_link);
  end if;

  if p_email_to is not null then
    insert into public.email_outbox
      (to_email, cc, bcc, subject, body, event_key, recipient_profile_id, status)
    values (p_email_to, p_email_cc, p_email_bcc, p_email_subject, p_email_body,
            p_event_key, p_recipient, 'queued');
  end if;
end;
$$;

revoke all on function enqueue_notification(
  text, uuid, text, text, text, text, text[], text[], text, text
) from public;
grant execute on function enqueue_notification(
  text, uuid, text, text, text, text, text[], text[], text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed the catalogue
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  -- account
  ('account.welcome','Welcome','Sent when a new account finishes signing up.','account','The new user','{user_name,role_label}',10),
  ('account.onboarding_completed','Onboarding completed','Their role profile is complete.','account','The user','{user_name,role_label}',20),
  ('account.blocked','Account blocked','Admin has blocked the account.','account','The blocked user','{user_name,reason}',30),
  ('account.restored','Account restored','Admin has restored access.','account','The user','{user_name}',40),
  ('account.role_changed','Role changed','An admin changed their role.','account','The user','{user_name,role_label}',50),
  ('account.plan_changed','Plan changed','An admin assigned or changed their plan.','account','The user','{user_name,plan_name}',60),
  ('account.password_reset','Password reset','A password reset was requested.','account','The user','{user_name,link}',70),
  -- brand
  ('campaign.created','Campaign submitted','A brand submitted a sponsorship campaign.','brand','The brand','{user_name,campaign_reference,budget}',100),
  ('campaign.status_changed','Campaign status changed','The campaign moved to a new status.','brand','The brand','{campaign_reference,status}',110),
  ('campaign.matched','Campaign matched','The team matched a campaign to an event.','brand','The brand','{campaign_reference,event_name}',120),
  ('sponsorship.created','Sponsorship created','A sponsored event was created from a match.','brand','Brand and artist','{event_name,brand_name,artist_name}',130),
  ('sponsorship.artist_agreed','Artist agreed','The artist accepted the sponsorship terms.','brand','The brand','{event_name,artist_name}',140),
  ('sponsorship.confirmed','Sponsorship confirmed','Both parties agreed — the deal is live.','brand','Brand and artist','{event_name,budget}',150),
  ('sponsorship.completed','Sponsorship completed','The sponsored event was marked completed.','brand','Brand and artist','{event_name}',160),
  ('sponsorship.budget_low','Budget running low','Remaining sponsorship budget is nearly spent.','brand','The brand','{event_name,remaining_budget}',170),
  -- artist / organiser
  ('listing.published','Event published','A listing went live for sponsorship.','artist','The artist / organiser','{event_name}',200),
  ('listing.status_changed','Listing status changed','An admin changed a listing status.','artist','The artist / organiser','{event_name,status}',210),
  ('offer.received','New sponsor enquiry','A brand started a conversation about an event.','artist','The artist / organiser','{brand_name,event_name}',220),
  ('offer.proposal_received','Sponsorship proposal','A sponsored event is awaiting their agreement.','artist','The artist / organiser','{brand_name,event_name,budget}',230),
  ('participant.registered','New registration','An audience member registered for their event.','artist','The artist / organiser','{event_name,participant_count}',240),
  ('participant.proof_uploaded','Ticket proof submitted','A participant uploaded proof of purchase.','artist','The artist / organiser','{event_name}',250),
  -- audience
  ('participation.registered','Registration confirmed','They registered for a sponsored event.','audience','The audience member','{user_name,event_name,reward_rules}',300),
  ('participation.selected','Selected for a reward','They were selected for the reward pool.','audience','The audience member','{user_name,event_name}',310),
  ('participation.rejected','Not selected','They were not selected for this event.','audience','The audience member','{user_name,event_name}',320),
  ('participation.verified','Attendance verified','Their attendance was verified at the venue.','audience','The audience member','{user_name,event_name}',330),
  ('reward.released','Reward released','Their sponsor-funded reward has been released.','audience','The audience member','{user_name,event_name,amount}',340),
  ('participation.reminder','Event reminder','The event or the participation deadline is approaching.','audience','The audience member','{user_name,event_name,event_date}',350),
  -- messaging & admin
  ('message.received','New message','A new chat message from the counterparty.','messaging','The recipient','{sender_name,event_name}',400),
  ('admin.contact_message','New contact enquiry','Someone submitted the public contact form.','admin','The admin team','{name,email,subject}',410),
  ('admin.new_signup','New sign-up','A new account registered on the platform.','admin','The admin team','{user_name,role_label}',420),
  ('admin.campaign_request','Campaign needs matching','A new campaign is waiting to be matched.','admin','The admin team','{campaign_reference,budget}',430);

-- Default every event to both channels on; admin tunes from there.
insert into notification_settings (event_key)
select key from notification_events;

-- Starter templates so nothing is blank in the editor.
insert into notification_templates (event_key, channel, subject, body)
select key, 'in_app', name, coalesce(description, name) from notification_events;

insert into notification_templates (event_key, channel, subject, body)
select key,
       'email',
       name || ' · Live·En·Synergy',
       'Hi {{user_name}},' || chr(10) || chr(10) ||
       coalesce(description, name) || chr(10) || chr(10) ||
       '— The Live·En·Synergy team'
from notification_events;
