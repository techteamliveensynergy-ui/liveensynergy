-- =============================================================================
-- Live-En-Synergy — wording for five notifications that are now actually sent
-- (5 Oct: "set up every event, email and in-app").
--
-- participant.proof_uploaded, sponsorship.completed, sponsorship.budget_low,
-- listing.status_changed and admin.campaign_request were catalogued in 0006
-- but nothing triggered them; the app now does. Their templates were still
-- the seeded one-liners that don't say WHICH event, so they're rewritten —
-- only where an admin hasn't already edited them (same rule as 0022 step 6).
-- Every token used has a guaranteed value at its call site.
-- =============================================================================

with seeded(event_key, channel, old_subject, new_subject, new_body) as (
  values
  ('participant.proof_uploaded', 'in_app', 'Ticket proof submitted',
   'Ticket proof submitted for {{event_name}}',
   'A participant uploaded proof of their ticket for {{event_name}}. Review it from the event page.'),
  ('participant.proof_uploaded', 'email', 'Ticket proof submitted · Live·En·Synergy',
   'Ticket proof submitted for {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) || 'A participant uploaded proof of their ticket for {{event_name}}. Review it from the event page in your dashboard.' || chr(10) || chr(10) || '— The Live·En·Synergy team'),
  ('sponsorship.completed', 'in_app', 'Sponsorship completed',
   '{{event_name}} is complete',
   'The sponsored event {{event_name}} has been marked completed. Thank you!'),
  ('sponsorship.completed', 'email', 'Sponsorship completed · Live·En·Synergy',
   '{{event_name}} is complete · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) || 'The sponsored event {{event_name}} has been marked completed. Thank you for taking part.' || chr(10) || chr(10) || '— The Live·En·Synergy team'),
  ('sponsorship.budget_low', 'in_app', 'Budget running low',
   'Reward budget running low on {{event_name}}',
   'Only {{remaining_budget}} of the reward budget for {{event_name}} is left.'),
  ('sponsorship.budget_low', 'email', 'Budget running low · Live·En·Synergy',
   'Reward budget running low on {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) || 'Only {{remaining_budget}} of the reward budget for {{event_name}} is left. Get in touch if you would like to top it up.' || chr(10) || chr(10) || '— The Live·En·Synergy team'),
  ('listing.status_changed', 'in_app', 'Listing status changed',
   '{{event_name}} is now {{status}}',
   'Our team changed the status of your listing {{event_name}} to {{status}}.'),
  ('listing.status_changed', 'email', 'Listing status changed · Live·En·Synergy',
   '{{event_name}} is now {{status}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) || 'Our team changed the status of your listing {{event_name}} to {{status}}. Reply to this email if you have any questions.' || chr(10) || chr(10) || '— The Live·En·Synergy team')
)
update notification_templates t
   set subject = s.new_subject,
       body    = s.new_body
  from seeded s
 where t.event_key = s.event_key
   and t.channel = s.channel
   and t.subject = s.old_subject;

update notification_events
   set description = 'A paid (or waived) campaign is now open and needs events lined up.'
 where key = 'admin.campaign_request';
