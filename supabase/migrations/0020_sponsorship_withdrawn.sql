-- =============================================================================
-- Live-En-Synergy — `withdrawn` sponsorship status (3 Aug standup)
--
-- A campaign may now be suggested against several listings at once. When the
-- brand accepts one, the campaign closes and the *other* proposals have to go
-- somewhere: they aren't "completed" and they aren't still "in progress".
--
-- Deliberately its own migration. Postgres refuses to use a newly added enum
-- value inside the transaction that added it, so anything referencing
-- 'withdrawn' has to run afterwards — see 0021.
-- =============================================================================

alter type sponsorship_status add value if not exists 'withdrawn';
