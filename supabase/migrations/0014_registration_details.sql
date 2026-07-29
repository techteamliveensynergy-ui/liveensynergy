-- =============================================================================
-- Live-En-Synergy — registration details step
--
-- Aligned 29 Jul: registering moves from a single click on Discover to a
-- details page where the audience member reviews the event, confirms the
-- personal details we hold, and accepts the event's terms before committing.
-- The one-click flow let people sign up accidentally and without ever seeing
-- the reward rules or how attendance gets verified.
--
-- Recording *when* terms were accepted matters: a reward payout later depends
-- on that agreement, so "they ticked a box at some point" isn't good enough.
-- =============================================================================

alter table participations
  add column terms_accepted_at timestamptz;

comment on column participations.terms_accepted_at is
  'When the audience member accepted the event terms on the registration page. Null for rows created before 0014.';
