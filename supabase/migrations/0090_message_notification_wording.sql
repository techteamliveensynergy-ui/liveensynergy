-- =============================================================================
-- 0090 — "New message" notifications name the sender (GitHub #67).
--
-- message.received was seeded in 0006 and never reworded: the in-app body
-- reads "A new chat message from the counterparty." and nothing uses the
-- {{sender_name}} every call site already passes. With all brand and artist
-- conversations admin-mediated, the app now sends "the Live·En·Synergy team"
-- as sender_name whenever an admin writes (TEAM_SENDER_NAME in constants.ts)
-- and the organisation's name when a user writes to the team.
--
-- Only rows still exactly as seeded (subject AND body) are rewritten, so an
-- admin's own wording is never overwritten. {{sender_name}} is set at every
-- call site; {{event_name}} isn't, so it isn't used here.
-- =============================================================================

with seeded(channel, old_subject, old_body, new_subject, new_body) as (
  values
  ('in_app',
   'New message',
   'A new chat message from the counterparty.',
   'New message from {{sender_name}}',
   'You have a new message from {{sender_name}}. Open Messages to read and reply.'),
  ('email',
   'New message · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) || 'A new chat message from the counterparty.' || chr(10) || chr(10) || '— The Live·En·Synergy team',
   'New message from {{sender_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) || 'You have a new message from {{sender_name}}. Sign in and open Messages to read and reply.' || chr(10) || chr(10) || '— The Live·En·Synergy team')
)
update notification_templates t
   set subject = s.new_subject,
       body    = s.new_body
  from seeded s
 where t.event_key = 'message.received'
   and t.channel = s.channel
   and t.subject = s.old_subject
   and t.body = s.old_body;

update notification_events
   set description = 'A new chat message: from the Live·En·Synergy team to a user, or from a user to the team.'
 where key = 'message.received'
   and description = 'A new chat message from the counterparty.';
