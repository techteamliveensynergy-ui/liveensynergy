-- =============================================================================
-- Live-En-Synergy — name the event in notifications
--
-- Raised 29 Jul: notifications never said which event they were about, which
-- is confusing once someone is registered for several. The call sites were
-- already passing `event_name` — the templates simply never used it, and were
-- written in the third person ("They registered for a sponsored event"), which
-- reads oddly to the person actually receiving it.
--
-- This rewrites the event-bearing templates to name the event and address the
-- recipient directly, and updates notification_events.variables so the admin
-- template editor advertises the placeholders that are genuinely available.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Audience-facing participation notifications
-- ---------------------------------------------------------------------------
update notification_templates set
  subject = 'You''re registered for {{event_name}}',
  body    = 'You''re registered for {{event_name}}. Buy your ticket, then add your ticket reference under My events so your attendance can be verified.'
where event_key = 'participation.registered' and channel = 'in_app';

update notification_templates set
  subject = 'You''re registered for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'You''re registered for {{event_name}}.' || chr(10) || chr(10) ||
            'Next: buy your ticket, then add your ticket reference under My events so we can verify your attendance.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participation.registered' and channel = 'email';

update notification_templates set
  subject = 'You''ve been selected for {{event_name}}',
  body    = 'You''ve been selected for the reward pool for {{event_name}}. Confirm your payout details under My events to receive it.'
where event_key = 'participation.selected' and channel = 'in_app';

update notification_templates set
  subject = 'You''ve been selected for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'You''ve been selected for the reward pool for {{event_name}}.' || chr(10) || chr(10) ||
            'Confirm your payout details under My events to receive your reward.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participation.selected' and channel = 'email';

update notification_templates set
  subject = 'Attendance verified for {{event_name}}',
  body    = 'Your attendance at {{event_name}} has been verified. Your reward is being processed.'
where event_key = 'participation.verified' and channel = 'in_app';

update notification_templates set
  subject = 'Attendance verified for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'Your attendance at {{event_name}} has been verified and your reward is being processed.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participation.verified' and channel = 'email';

update notification_templates set
  subject = 'Not selected for {{event_name}}',
  body    = 'You weren''t selected for the reward pool for {{event_name}} this time. Other events are open — take a look under Discover events.'
where event_key = 'participation.rejected' and channel = 'in_app';

update notification_templates set
  subject = 'Not selected for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'You weren''t selected for the reward pool for {{event_name}} this time.' || chr(10) || chr(10) ||
            'Other events are open for registration — take a look under Discover events.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participation.rejected' and channel = 'email';

update notification_templates set
  subject = 'Reminder: {{event_name}}',
  body    = '{{event_name}} is coming up. Make sure your ticket reference is added under My events before the deadline.'
where event_key = 'participation.reminder' and channel = 'in_app';

update notification_templates set
  subject = 'Reminder: {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            '{{event_name}} is coming up. Make sure your ticket reference is added under My events before the deadline.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participation.reminder' and channel = 'email';

update notification_templates set
  subject = 'Reward released for {{event_name}}',
  body    = 'Your reward of {{amount}} for {{event_name}} has been released.'
where event_key = 'reward.released' and channel = 'in_app';

-- ---------------------------------------------------------------------------
-- Artist / organiser and brand-facing
-- ---------------------------------------------------------------------------
update notification_templates set
  subject = 'New registration for {{event_name}}',
  body    = 'An audience member registered for {{event_name}}.'
where event_key = 'participant.registered' and channel = 'in_app';

update notification_templates set
  subject = 'New registration for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'An audience member registered for {{event_name}}.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participant.registered' and channel = 'email';

update notification_templates set
  subject = 'Sponsorship proposal for {{event_name}}',
  body    = 'A sponsorship for {{event_name}} is waiting for your agreement ({{budget}}).'
where event_key = 'offer.proposal_received' and channel = 'in_app';

update notification_templates set
  subject = 'Sponsorship proposal for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'A sponsorship for {{event_name}} is waiting for your agreement ({{budget}}).' || chr(10) || chr(10) ||
            'Review the terms and confirm to make the deal live.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'offer.proposal_received' and channel = 'email';

update notification_templates set
  subject = 'Sponsorship confirmed for {{event_name}}',
  body    = 'Both parties have agreed — the sponsorship for {{event_name}} is live ({{budget}}).'
where event_key = 'sponsorship.confirmed' and channel = 'in_app';

update notification_templates set
  subject = 'Sponsorship confirmed for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'Both parties have agreed — the sponsorship for {{event_name}} is live ({{budget}}).' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'sponsorship.confirmed' and channel = 'email';

update notification_templates set
  subject = '{{event_name}} is now live for sponsorship',
  body    = 'Your event {{event_name}} has been published and is open for sponsors to find.'
where event_key = 'listing.published' and channel = 'in_app';

update notification_templates set
  subject = '{{event_name}} is now live for sponsorship · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'Your event {{event_name}} has been published and is open for sponsors to find.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'listing.published' and channel = 'email';

update notification_templates set
  subject = 'Campaign {{campaign_reference}} matched to {{event_name}}',
  body    = 'The team matched campaign {{campaign_reference}} to {{event_name}}.'
where event_key = 'campaign.matched' and channel = 'in_app';

update notification_templates set
  subject = 'Campaign {{campaign_reference}} matched to {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'The team matched campaign {{campaign_reference}} to {{event_name}}.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'campaign.matched' and channel = 'email';

-- ---------------------------------------------------------------------------
-- Tell the admin template editor which placeholders each event actually has,
-- so whoever edits a template can see what's available to them.
-- ---------------------------------------------------------------------------
update notification_events set variables = '{user_name,event_name}'
  where key in ('participant.registered', 'participation.verified',
                'participation.reminder', 'listing.published');

update notification_events set variables = '{user_name,event_name,reward_rules}'
  where key = 'participation.registered';

update notification_events set variables = '{user_name,event_name,amount}'
  where key in ('participation.selected', 'participation.rejected',
                'reward.released');

update notification_events set variables = '{user_name,event_name,budget}'
  where key in ('offer.proposal_received', 'sponsorship.confirmed');

update notification_events set variables = '{user_name,campaign_reference,event_name}'
  where key = 'campaign.matched';
