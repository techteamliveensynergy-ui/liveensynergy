-- =============================================================================
-- QA 31 Oct L-09 — notification wording left over from the cash-reward model.
-- Rewards are discount codes now; there are no payout details to confirm.
-- Only rows still carrying the old wording are touched (admin edits survive).
-- Re-runnable.
-- =============================================================================

update notification_templates set
  subject = 'You''ve been selected for {{event_name}}',
  body    = 'You''ve been selected for {{event_name}}. Your discount code is released once you have attended and completed the survey — see My events.'
where event_key = 'participation.selected' and channel = 'in_app'
  and body ilike '%payout%';

update notification_templates set
  subject = 'You''ve been selected for {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'You''ve been selected for {{event_name}}.' || chr(10) || chr(10) ||
            'Your discount code is released once you have attended and completed the survey. You can follow progress under My events.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'participation.selected' and channel = 'email'
  and body ilike '%payout%';

update notification_templates set
  body = 'Your attendance at {{event_name}} has been verified. Your discount code will be released shortly.'
where event_key = 'participation.verified' and channel = 'in_app'
  and body ilike '%reward is being processed%';

update notification_templates set
  body = 'Hi {{user_name}},' || chr(10) || chr(10) ||
         'Your attendance at {{event_name}} has been verified and your discount code will be released shortly.' || chr(10) || chr(10) ||
         '— The Live·En·Synergy team'
where event_key = 'participation.verified' and channel = 'email'
  and body ilike '%reward is being processed%';

update notification_templates set
  subject = 'Discount code released for {{event_name}}',
  body    = 'Your discount code for {{event_name}} has been released. Find it under My rewards.'
where event_key = 'reward.released' and channel = 'in_app'
  and body ilike '%{{amount}}%';

update notification_templates set
  body = replace(replace(body, 'reward pool', 'event'), 'the reward for', 'the discount code for')
where event_key in ('participation.rejected') and body ilike '%reward pool%';
